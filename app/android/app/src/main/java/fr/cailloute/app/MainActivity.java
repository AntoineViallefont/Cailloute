package fr.cailloute.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.Intent;
import android.content.res.Configuration;

public class MainActivity extends BridgeActivity {
    private boolean created=false;
    private volatile boolean launchReady=false;
    private long launchStarted;
    private String appliedNightTheme;
    private Boolean appliedDark;


    @Override public void onCreate(Bundle savedInstanceState){
        launchStarted=android.os.SystemClock.elapsedRealtime();
        if(android.os.Build.VERSION.SDK_INT>=31){
            androidx.core.splashscreen.SplashScreen splash=androidx.core.splashscreen.SplashScreen.installSplashScreen(this);
            // Privilégier la carte prête, mais ne jamais retenir Android sur le logo en cas de panne.
            splash.setKeepOnScreenCondition(() -> !launchReady && android.os.SystemClock.elapsedRealtime()-launchStarted<10000);
            splash.setOnExitAnimationListener(provider -> provider.remove());
        }
        registerPlugin(CaillouteSyncPlugin.class);
        registerPlugin(CaillouteNavigationPlugin.class);
        registerPlugin(CaillouteLaunchPlugin.class);
        registerPlugin(CailloutePhotoFilesPlugin.class);
        registerPlugin(CaillouteCameraPlugin.class);
        registerPlugin(CaillouteFacesPlugin.class);
        super.onCreate(savedInstanceState);
        created=true;
        applyAppearance(getSharedPreferences("cailloute-appearance",0).getString("theme","system"));
        SyncQueue.schedule(this);
    }
    @Override protected void onNewIntent(Intent intent){
        super.onNewIntent(intent);
        if(created && Intent.ACTION_MAIN.equals(intent.getAction()) && intent.hasCategory(Intent.CATEGORY_LAUNCHER)){
            applyAppearance(getSharedPreferences("cailloute-appearance",0).getString("theme","system"));
        }
    }
    public boolean isDark(String theme){
        return theme.equals("dark") || (theme.equals("system") &&
            (android.content.res.Resources.getSystem().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES);
    }
    private void refreshAppearance(){
        String theme=getSharedPreferences("cailloute-appearance",0).getString("theme","system");
        boolean dark=isDark(theme);
        if(appliedDark!=null && appliedDark==dark)return;
        applyAppearance(theme);
        if(bridge!=null) bridge.triggerWindowJSEvent("cailloute-appearance");
    }
    @Override public void onConfigurationChanged(Configuration configuration){
        super.onConfigurationChanged(configuration);
        refreshAppearance();
    }
    @Override public void onResume(){
        super.onResume();
        refreshAppearance();
    }
    public void applyAppearance(String theme){
        boolean dark=isDark(theme);
        appliedDark=dark;
        // Android mémorise ce choix pour dessiner le prochain lancement avant le démarrage du processus.
        if(android.os.Build.VERSION.SDK_INT>=31 && !theme.equals(appliedNightTheme)){
            appliedNightTheme=theme;
            android.app.UiModeManager manager=getSystemService(android.app.UiModeManager.class);
            int mode=theme.equals("dark") ? android.app.UiModeManager.MODE_NIGHT_YES
                : theme.equals("light") ? android.app.UiModeManager.MODE_NIGHT_NO
                : android.app.UiModeManager.MODE_NIGHT_AUTO;
            // Pour setApplicationNightMode, AUTO retire le choix propre à l'app et suit le système.
            if(manager!=null) manager.setApplicationNightMode(mode);
        }
        if(android.os.Build.VERSION.SDK_INT>=30){
            android.view.WindowInsetsController controller=getWindow().getInsetsController();
            if(controller!=null){int mask=android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;controller.setSystemBarsAppearance(dark?0:mask,mask);}
        }

    }
    public void finishLaunch(){
        launchReady=true;
        applyAppearance(getSharedPreferences("cailloute-appearance",0).getString("theme","system"));
    }
}
