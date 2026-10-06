package fr.cailloute.app;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="CaillouteSync")
public final class CaillouteSyncPlugin extends Plugin {
    @PluginMethod public void configure(PluginCall call){try{SyncQueue.configure(getContext(),call.getString("url",""),call.getString("token",""),call.getString("owner",""));call.resolve();}catch(Exception e){call.reject("Configuration de synchronisation invalide");}}
    @PluginMethod public void session(PluginCall call){try{JSObject r=new JSObject();r.put("token",SyncQueue.token(getContext()));r.put("owner",SyncQueue.owner(getContext()));call.resolve(r);}catch(Exception e){JSObject r=new JSObject();r.put("token","");r.put("owner","");call.resolve(r);}}
    @PluginMethod public void enqueue(PluginCall call){try(SyncQueue q=new SyncQueue(getContext())){q.enqueue(call.getString("operation",""),call.getString("owner",""),call.getString("server",""));SyncQueue.schedule(getContext());call.resolve();}catch(Exception e){call.reject("Impossible de conserver cette contribution");}}
    @PluginMethod public void flush(PluginCall call){execute(()->{try(SyncQueue q=new SyncQueue(getContext())){q.flush();call.resolve();}catch(Exception e){call.reject("Envoi reporté");}});}
    @PluginMethod public void statuses(PluginCall call){try(SyncQueue q=new SyncQueue(getContext())){JSObject result=new JSObject();result.put("items",q.statuses());call.resolve(result);}catch(Exception e){call.reject("Lecture de la file impossible");}}
    @PluginMethod public void forget(PluginCall call){try(SyncQueue q=new SyncQueue(getContext())){q.forget(call.getString("id",""));call.resolve();}}
    @Override protected void handleOnPause(){SyncQueue.schedule(getContext());}
}
