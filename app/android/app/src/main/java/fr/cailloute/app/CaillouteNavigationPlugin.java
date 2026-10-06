package fr.cailloute.app;

import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.LinkedHashMap;
import java.util.Map;

@CapacitorPlugin(name="CaillouteNavigation")
public class CaillouteNavigationPlugin extends Plugin {
    @PluginMethod public void apps(PluginCall call) {
        Map<String,String> available=new LinkedHashMap<>();
        Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("geo:0,0?q=45.75,4.83"));
        for(ResolveInfo r:getContext().getPackageManager().queryIntentActivities(intent,0)) {
            String id=r.activityInfo.packageName;
            if(id.equals(getContext().getPackageName())) continue;
            if(id.equals("com.waze") && !"driving".equals(call.getString("mode"))) continue;
            available.put(id,r.loadLabel(getContext().getPackageManager()).toString());
        }
        // Certains navigateurs GPS ne déclarent pas le protocole geo.
        if("driving".equals(call.getString("mode"))) {
            Intent waze=new Intent(Intent.ACTION_VIEW,Uri.parse("waze://?ll=45.75,4.83&navigate=yes")).setPackage("com.waze");
            if(waze.resolveActivity(getContext().getPackageManager())!=null) available.put("com.waze","Waze");
        }
        JSArray result=new JSArray();
        for(Map.Entry<String,String> item:available.entrySet()) {
            JSObject app=new JSObject().put("id",item.getKey()).put("label",item.getValue());
            try {
                Drawable icon=getContext().getPackageManager().getApplicationIcon(item.getKey());
                Bitmap bitmap=Bitmap.createBitmap(96,96,Bitmap.Config.ARGB_8888);
                icon.setBounds(0,0,96,96); icon.draw(new Canvas(bitmap));
                ByteArrayOutputStream output=new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG,100,output); bitmap.recycle();
                app.put("icon","data:image/png;base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP));
            } catch(Exception ignored) {}
            result.put(app);
        }
        result.put(new JSObject().put("id","browser").put("label","Google Maps (lien web)"));
        call.resolve(new JSObject().put("apps",result));
    }
    @PluginMethod public void openPmrPlanner(PluginCall call) {
        // Aucun paramètre d'accessibilité public vérifié : formulaire TCL explicite.
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.tcl.fr/"));
        try { getActivity().startActivity(intent); call.resolve(); }
        catch (Exception e) { call.reject("Calculateur TCL inaccessible"); }
    }
    @PluginMethod public void open(PluginCall call) {
        String id=call.getString("id",""),mode=call.getString("mode","");
        Double lat=call.getDouble("lat"),lon=call.getDouble("lon");
        if(lat==null||lon==null||!Double.isFinite(lat)||!Double.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){call.reject("Coordonnées invalides");return;}
        String coordinates=lat+","+lon;
        Uri uri;
        if(id.equals("com.google.android.apps.maps")||id.equals("browser")) {
            // Construire l'URL ici évite d'ouvrir une URL arbitraire depuis le pont.
            Uri.Builder builder=Uri.parse("https://www.google.com/maps/dir/").buildUpon().appendQueryParameter("api","1").appendQueryParameter("destination",coordinates);
            if(java.util.Arrays.asList("walking","bicycling","transit","driving").contains(mode)) builder.appendQueryParameter("travelmode",mode);
            // L'origine choisie dans Cailloute est incluse dans l'URL validée.
            Uri supplied=Uri.parse(call.getString("googleUrl",""));
            String origin=supplied.getQueryParameter("origin");
            if(origin!=null&&origin.matches("-?[0-9.]+,-?[0-9.]+")) builder.appendQueryParameter("origin",origin);
            uri=builder.build();
        } else if(id.equals("com.waze")) {
            if(!mode.equals("driving")){call.reject("Waze nécessite le mode voiture");return;}
            uri=Uri.parse("waze://?ll="+coordinates+"&navigate=yes");
        } else uri=Uri.parse("geo:0,0?q="+Uri.encode(coordinates+" ("+call.getString("name","")+")"));
        Intent intent=new Intent(Intent.ACTION_VIEW,uri);
        if(!id.equals("browser")) intent.setPackage(id);
        try {getActivity().startActivity(intent);call.resolve();}
        catch(Exception e){call.reject("Application inaccessible");}
    }
}
