package fr.cailloute.app;

import android.app.Activity;
import android.Manifest;
import android.os.Build;
import android.content.Intent;
import android.content.ClipData;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Ouvre les originaux sélectionnés, avec leurs éventuelles métadonnées GPS. */
@CapacitorPlugin(name = "CailloutePhotoFiles", permissions = @Permission(alias = "photoLocation", strings = {Manifest.permission.ACCESS_MEDIA_LOCATION}))
public class CailloutePhotoFilesPlugin extends Plugin {
    @PluginMethod public void choose(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 29 && call.getBoolean("includePosition", false)
                && getPermissionState("photoLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("photoLocation", call, "locationPermissionResult"); return;
        }
        openDocuments(call);
    }
    @PermissionCallback private void locationPermissionResult(PluginCall call) {
        // Un refus n'empêche pas d'importer la photo et de placer le lieu manuellement.
        openDocuments(call);
    }
    private void openDocuments(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivityForResult(call, intent, "selected"); }
        catch (Exception error) { call.reject("Ouverture de la galerie impossible.", error); }
    }
    @ActivityCallback private void selected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Sélection annulée"); return;
        }
        try {
        Intent data = result.getData();
        JSArray files = new JSArray();
        int limit = Math.max(1, call.getInt("limit", Integer.MAX_VALUE));
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i=0; i<Math.min(limit, clip.getItemCount()); i++) add(files, clip.getItemAt(i).getUri());
        } else if (data.getData() != null) add(files, data.getData());
        JSObject value = new JSObject(); value.put("files", files); call.resolve(value);
        } catch (Exception error) { call.reject("Lecture de la sélection impossible.", error); }
    }
    private void add(JSArray files, Uri uri) {
        JSObject item = new JSObject();
        // Ne jamais résoudre/copier le fichier ici : ce callback tourne sur le thread UI.
        // Le serveur local Capacitor lit le content:// à la demande, hors du thread UI.
        if (!"content".equals(uri.getScheme())) throw new IllegalArgumentException("Source photo invalide.");
        item.put("uri", uri.toString());
        files.put(item);
    }
}
