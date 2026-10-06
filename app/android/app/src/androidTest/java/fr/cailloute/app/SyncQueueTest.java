package fr.cailloute.app;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.database.sqlite.SQLiteDatabase;
import android.database.DatabaseErrorHandler;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SyncQueueTest {
    Context context;
    @Before public void before(){context=new ContextWrapper(InstrumentationRegistry.getInstrumentation().getTargetContext()){
        @Override public Context getApplicationContext(){return this;}
        @Override public SharedPreferences getSharedPreferences(String name,int mode){return super.getSharedPreferences("qa-"+name,mode);}
        @Override public File getDatabasePath(String name){return super.getDatabasePath("qa-"+name);}
        @Override public boolean deleteDatabase(String name){return super.deleteDatabase("qa-"+name);}
        @Override public SQLiteDatabase openOrCreateDatabase(String name,int mode,SQLiteDatabase.CursorFactory f,DatabaseErrorHandler h){return super.openOrCreateDatabase("qa-"+name,mode,f,h);}
    };context.deleteDatabase("cailloute-outbox.db");context.getSharedPreferences("cailloute-secure",0).edit().clear().commit();}
    @After public void after(){context.deleteDatabase("cailloute-outbox.db");context.getSharedPreferences("cailloute-secure",0).edit().clear().commit();}
    String operation(String id)throws Exception{return new JSONObject().put("id",id).put("kind","review.save").put("place_id","qa-test").put("payload",new JSONObject().put("stars",4)).toString();}
    @Test public void encryptedTokenAndDurableIdempotentQueue() throws Exception {
        SyncQueue.configure(context,"http://127.0.0.1:8787","test-token-never-public","qa");
        assertEquals("test-token-never-public",SyncQueue.token(context));
        assertFalse(context.getSharedPreferences("cailloute-secure",0).getString("token","").contains("test-token"));
        String id=UUID.randomUUID().toString();
        try(SyncQueue q=new SyncQueue(context)){q.enqueue(operation(id),"qa","http://127.0.0.1:8787");q.enqueue(operation(id),"qa","http://127.0.0.1:8787");}
        try(SyncQueue q=new SyncQueue(context)){assertEquals(1,q.statuses().length());assertEquals("pending",q.statuses().getJSONObject(0).getString("status"));}
    }
    @Test public void retryAfterServerFailureAndRetainConflict()throws Exception {
        try(ServerSocket server=new ServerSocket(0)){
            String url="http://127.0.0.1:"+server.getLocalPort();SyncQueue.configure(context,url,"test-token","qa");
            ExecutorService ex=Executors.newSingleThreadExecutor();
            Future<?> serving=ex.submit(()->{try{for(int status:new int[]{503,200,409}){try(Socket socket=server.accept()){BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream()));String line;int length=0;while((line=reader.readLine())!=null&&!line.isEmpty()){if(line.toLowerCase().startsWith("content-length:"))length=Integer.parseInt(line.split(":")[1].trim());}for(int i=0;i<length;i++)reader.read();String body=status==409?"{\"detail\":\"conflit\"}":"{}";byte[] bytes=body.getBytes();socket.getOutputStream().write(("HTTP/1.1 "+status+" Test\r\nContent-Type: application/json\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\n\r\n").getBytes());socket.getOutputStream().write(bytes);}}}catch(Exception e){throw new RuntimeException(e);}});
            try(SyncQueue q=new SyncQueue(context)){
                q.enqueue(operation(UUID.randomUUID().toString()),"qa",url);assertFalse(q.flush());assertEquals("pending",q.statuses().getJSONObject(0).getString("status"));
                assertTrue(q.flush());assertEquals("done",q.statuses().getJSONObject(0).getString("status"));
                q.enqueue(operation(UUID.randomUUID().toString()),"qa",url);assertTrue(q.flush());assertEquals("error",q.statuses().getJSONObject(1).getString("status"));
            }
            serving.get(10,TimeUnit.SECONDS);ex.shutdownNow();
        }
    }
    @Test public void noSubmissionUnderAnotherAccount()throws Exception {
        SyncQueue.configure(context,"http://127.0.0.1:9","test-token","second");
        try(SyncQueue q=new SyncQueue(context)){q.enqueue(operation(UUID.randomUUID().toString()),"first","http://127.0.0.1:9");assertTrue(q.flush());assertEquals("pending",q.statuses().getJSONObject(0).getString("status"));}
    }
}
