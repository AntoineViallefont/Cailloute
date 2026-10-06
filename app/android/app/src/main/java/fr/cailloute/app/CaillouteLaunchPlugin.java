package fr.cailloute.app;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="CaillouteLaunch")
public class CaillouteLaunchPlugin extends Plugin {
    @PluginMethod public void ready(PluginCall call) {
        getActivity().runOnUiThread(() -> {((MainActivity)getActivity()).finishLaunch();call.resolve();});
    }
    @PluginMethod public void theme(PluginCall call) {
        String theme=call.getString("theme","system");
        if(!java.util.Arrays.asList("light","dark","system").contains(theme)){call.reject("Thème invalide");return;}
        getContext().getSharedPreferences("cailloute-appearance",0).edit().putString("theme",theme).apply();
        getActivity().runOnUiThread(() -> {MainActivity activity=(MainActivity)getActivity();activity.applyAppearance(theme);com.getcapacitor.JSObject result=new com.getcapacitor.JSObject();result.put("dark",activity.isDark(theme));call.resolve(result);});
    }
}
