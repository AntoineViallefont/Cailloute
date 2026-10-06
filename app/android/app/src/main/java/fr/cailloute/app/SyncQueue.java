package fr.cailloute.app;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.work.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.util.concurrent.TimeUnit;

/** File durable séparée du WebView, envoyée même lorsque l'activité est arrêtée. */
public final class SyncQueue extends SQLiteOpenHelper {
    static final Object LOCK = new Object();
    private final Context context;
    public SyncQueue(Context c) { super(c, "cailloute-outbox.db", null, 1); context=c.getApplicationContext(); }
    public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE queue (id TEXT PRIMARY KEY, operation TEXT NOT NULL, owner TEXT NOT NULL, server TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT DEFAULT '', created INTEGER NOT NULL)"); }
    public void onUpgrade(SQLiteDatabase db,int oldV,int newV) { throw new IllegalStateException("Migration non définie"); }
    static String encrypt(String plain) throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if (!ks.containsAlias("cailloute-session")) { KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder("cailloute-session",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());gen.generateKey(); }
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,ks.getKey("cailloute-session",null));
        return Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(plain.getBytes("UTF-8")),Base64.NO_WRAP);
    }
    static String decrypt(String encoded) throws Exception {
        if(encoded.isEmpty()) return "";
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);String[] parts=encoded.split(":");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,ks.getKey("cailloute-session",null),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),"UTF-8");
    }
    static void validateUrl(String url) throws Exception {
        URL parsed=new URL(url);
        if(!parsed.getProtocol().equals("https") && !(BuildConfig.DEBUG && parsed.getProtocol().equals("http"))) throw new IllegalArgumentException("HTTPS obligatoire");
        if(parsed.getUserInfo()!=null || parsed.getQuery()!=null || parsed.getRef()!=null)throw new IllegalArgumentException("Adresse invalide");
    }
    static void configure(Context c,String url,String token,String owner) throws Exception {
        validateUrl(url);
        c.getSharedPreferences("cailloute-secure",Context.MODE_PRIVATE).edit().putString("url",url).putString("token",token.isEmpty()?"":encrypt(token)).putString("owner",owner).commit();
    }
    static String token(Context c) throws Exception {return decrypt(c.getSharedPreferences("cailloute-secure",Context.MODE_PRIVATE).getString("token",""));}
    static String owner(Context c){return c.getSharedPreferences("cailloute-secure",Context.MODE_PRIVATE).getString("owner","");}
    public void enqueue(String operation,String owner,String server) throws Exception {
        validateUrl(server);JSONObject op=new JSONObject(operation);String id=op.getString("id");java.util.UUID.fromString(id);
        if(operation.length()>3_800_000)throw new IllegalArgumentException("Contribution trop volumineuse");
        ContentValues row=new ContentValues();row.put("id",id);row.put("operation",operation);row.put("owner",owner);row.put("server",server);row.put("status","pending");row.put("created",System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("queue",null,row,SQLiteDatabase.CONFLICT_IGNORE);
    }
    public JSONArray statuses() throws Exception {
        JSONArray result=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT id,status,error FROM queue",null)){while(c.moveToNext()){JSONObject row=new JSONObject();row.put("id",c.getString(0));row.put("status",c.getString(1));row.put("error",c.getString(2));result.put(row);}}
        return result;
    }
    public void forget(String id){getWritableDatabase().delete("queue","id=?",new String[]{id});}
    /** Les reçus côté serveur rendent une reprise réseau idempotente. */
    public boolean flush() {
        // Même une ancienne file collaborative reste inactive pendant les essais locaux.
        if (BuildConfig.PERSONAL_MODE) return true;
        synchronized(LOCK) {
            try {
                String owner=owner(context),token=token(context);if(owner.isEmpty()||token.isEmpty())return true;
                String server=context.getSharedPreferences("cailloute-secure",Context.MODE_PRIVATE).getString("url","");validateUrl(server);
                try(Cursor c=getReadableDatabase().rawQuery("SELECT id,operation FROM queue WHERE status='pending' AND owner=? AND server=? ORDER BY created",new String[]{owner,server})){
                    while(c.moveToNext()){
                        String id=c.getString(0);HttpURLConnection conn=(HttpURLConnection)new URL(server+"/v1/operations").openConnection();
                        conn.setInstanceFollowRedirects(false);conn.setRequestMethod("POST");conn.setConnectTimeout(15000);conn.setReadTimeout(30000);conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("Authorization","Bearer "+token);
                        try {
                            byte[] body=c.getString(1).getBytes("UTF-8");conn.setFixedLengthStreamingMode(body.length);try(OutputStream out=conn.getOutputStream()){out.write(body);}
                            int code=conn.getResponseCode();if(code==429||code>=500||code==408)return false;
                            ContentValues update=new ContentValues();
                            if(code>=200&&code<300){update.put("status","done");update.put("error","");}
                            else {String error="Erreur "+code;InputStream in=conn.getErrorStream();if(in!=null){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[2048];int n;try(in){while((n=in.read(buffer))!=-1&&out.size()<64000)out.write(buffer,0,n);}error=out.toString("UTF-8");}update.put("status","error");update.put("error",error);}
                            getWritableDatabase().update("queue",update,"id=?",new String[]{id});
                        } finally {conn.disconnect();}
                    }
                }
                return true;
            } catch(Exception e){return false;}
        }
    }
    static void schedule(Context c){
        if (BuildConfig.PERSONAL_MODE) {
            WorkManager.getInstance(c).cancelUniqueWork("cailloute-send");
            WorkManager.getInstance(c).cancelUniqueWork("cailloute-retry");
            return;
        }
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        WorkManager wm=WorkManager.getInstance(c);
        wm.enqueueUniqueWork("cailloute-send",ExistingWorkPolicy.KEEP,new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build());
        wm.enqueueUniquePeriodicWork("cailloute-retry",ExistingPeriodicWorkPolicy.KEEP,new PeriodicWorkRequest.Builder(SyncWorker.class,15,TimeUnit.MINUTES).setConstraints(constraints).build());
    }
}
