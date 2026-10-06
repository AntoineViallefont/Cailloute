package fr.cailloute.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import ai.onnxruntime.*;
import java.nio.FloatBuffer;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/** Même modèle local que le web ; calcul natif hors UI, sans envoi d'image. */
@CapacitorPlugin(name = "CaillouteFaces")
public class CaillouteFacesPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final AtomicBoolean preparationCancelled = new AtomicBoolean(false);
    private volatile String preparationId = "";
    private OrtEnvironment environment;
    private OrtSession model;
    private void initialize() throws Exception {
        if (model != null) return;
        environment = OrtEnvironment.getEnvironment();
        environment.setTelemetry(false);
        try (OrtSession.SessionOptions options = new OrtSession.SessionOptions(); java.io.InputStream input = getContext().getAssets().open("public/photo-privacy/face-detector.onnx")) {
            options.setIntraOpNumThreads(2); options.setInterOpNumThreads(1);
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[16384]; int length;
            while ((length = input.read(buffer)) != -1) bytes.write(buffer, 0, length);
            model = environment.createSession(bytes.toByteArray(), options);
        }
    }
    @PluginMethod public void warm(PluginCall call) {
        executor.execute(() -> { try { initialize(); call.resolve(); } catch (Exception e) { call.reject("Détection indisponible."); } });
    }
    @PluginMethod public void release(PluginCall call) {
        executor.execute(() -> { try { if(model!=null)model.close();model=null;call.resolve(); } catch(Exception e){call.reject("Libération indisponible.");} });
    }
    @PluginMethod public void detect(PluginCall call) {
        String encoded = call.getString("base64", "");
        if (encoded.isEmpty() || encoded.length() > 6000000) { call.reject("Photo invalide."); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("Détection occupée."); return; }
        executor.execute(() -> {
            Bitmap source = null; JSObject response = null;
            try {
                initialize();
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options); options.inSampleSize = 1;
                while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 1280) options.inSampleSize *= 2;
                options.inJustDecodeBounds = false; source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                if (source == null) throw new IllegalArgumentException("Photo illisible.");
                response = analyze(source);
            } catch(Exception e) { /* Retour explicite : la vérification manuelle reste requise. */ }
            finally { if(source!=null)source.recycle();busy.set(false); }
            if(response!=null)call.resolve(response);else call.reject("Détection indisponible.");
        });
    }
    private JSObject analyze(Bitmap source) throws Exception {
                Bitmap small = Bitmap.createBitmap(640, 640, Bitmap.Config.ARGB_8888);
                try {
                new Canvas(small).drawBitmap(source, null, new android.graphics.Rect(0, 0, 640, 640), new Paint(Paint.FILTER_BITMAP_FLAG));
                int n = 640 * 640; int[] pixels = new int[n]; small.getPixels(pixels, 0, 640, 0, 0, 640, 640);
                float[] rgb = new float[3*n];
                for (int i=0; i<n; i++) { rgb[i]=(pixels[i]&255); rgb[n+i]=((pixels[i]>>8)&255); rgb[2*n+i]=((pixels[i]>>16)&255); }
                JSArray masks = new JSArray();
                try (OnnxTensor input = OnnxTensor.createTensor(environment, FloatBuffer.wrap(rgb), new long[]{1,3,640,640}); OrtSession.Result outputs = model.run(Collections.singletonMap(model.getInputNames().iterator().next(), input))) {
                    ArrayList<float[]> candidates = new ArrayList<>(), kept = new ArrayList<>();
                    for (int stride : new int[]{8,16,32}) {
                        FloatBuffer cls=((OnnxTensor)outputs.get("cls_"+stride).get()).getFloatBuffer();
                        FloatBuffer obj=((OnnxTensor)outputs.get("obj_"+stride).get()).getFloatBuffer();
                        FloatBuffer box=((OnnxTensor)outputs.get("bbox_"+stride).get()).getFloatBuffer();
                        int columns=640/stride;
                        for(int i=0;i<columns*columns;i++) {
                            float score=(float)Math.sqrt(Math.max(0,Math.min(1,cls.get(i)))*Math.max(0,Math.min(1,obj.get(i))));
                            if(!Float.isFinite(score)||score<0.6f)continue;
                            float w=(float)Math.exp(box.get(i*4+2))*stride/640f,h=(float)Math.exp(box.get(i*4+3))*stride/640f;
                            float x=((i%columns)+box.get(i*4))*stride/640f-w/2f,y=((i/columns)+box.get(i*4+1))*stride/640f-h/2f;
                            if(w>0&&h>0)candidates.add(new float[]{x,y,w,h,score});
                        }
                    }
                    candidates.sort((a,b)->Float.compare(b[4],a[4]));
                    for(float[] a:candidates){boolean duplicate=false;for(float[] b:kept){float area=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));if(area/(a[2]*a[3]+b[2]*b[3]-area)>0.4f){duplicate=true;break;}}if(duplicate)continue;kept.add(a);
                        float left=Math.max(0,a[0]-a[2]*0.4f),top=Math.max(0,a[1]-a[3]*0.5f),right=Math.min(1,a[0]+a[2]*1.4f),bottom=Math.min(1,a[1]+a[3]*1.5f);
                        if(right<=left||bottom<=top)continue;JSObject mask=new JSObject();mask.put("x",left);mask.put("y",top);mask.put("width",right-left);mask.put("height",bottom-top);mask.put("rounded",true);masks.put(mask);
                    }
                }
                JSObject response=new JSObject();response.put("masks",masks);response.put("incomplete",false);return response;
                } finally { small.recycle(); }
    }
    @PluginMethod public void cancelPrepare(PluginCall call) {
        String id = call.getString("id", "");
        if (!id.isEmpty() && id.equals(preparationId)) preparationCancelled.set(true);
        call.resolve();
    }
    private void checkPreparation() {
        if (preparationCancelled.get()) throw new java.util.concurrent.CancellationException("Préparation annulée");
    }
    @PluginMethod public void prepare(PluginCall call) {
        String uri = call.getString("uri", "");
        if (!uri.startsWith("content://") && !uri.startsWith("file://")) { call.reject("Source photo invalide."); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("Détection occupée. Réessayez."); return; }
        preparationId = call.getString("id", ""); preparationCancelled.set(false);
        executor.execute(() -> {
            Bitmap source = null;
            long start = android.os.SystemClock.elapsedRealtime();
            try {
                checkPreparation();
                boolean detectFaces = call.getBoolean("detectFaces", true);
                CailloutePhotoDecoder.Decoded decoded = CailloutePhotoDecoder.read(getContext(), android.net.Uri.parse(uri), call.getBoolean("includePosition", false), detectFaces ? 640 : 1024);
                source = decoded.bitmap;
                checkPreparation();
                long decodedAt = android.os.SystemClock.elapsedRealtime();
                JSObject response;
                long initializedAt = decodedAt, analyzedAt;
                try {
                    if (detectFaces) {
                        initialize(); initializedAt = android.os.SystemClock.elapsedRealtime();
                        response = analyze(source);
                    } else {
                        response = new JSObject(); response.put("masks", new JSArray()); response.put("incomplete", false);
                    }
                } catch (Exception error) {
                    response = new JSObject(); response.put("masks", new JSArray()); response.put("incomplete", true);
                }
                analyzedAt = android.os.SystemClock.elapsedRealtime();
                checkPreparation();
                java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
                source.compress(Bitmap.CompressFormat.JPEG, 88, output);
                response.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                response.put("width", source.getWidth()); response.put("height", source.getHeight());
                if (decoded.position != null) response.put("position", decoded.position);
                long encodedAt = android.os.SystemClock.elapsedRealtime();
                if (detectFaces) response.put("preview", CailloutePhotoPreview.encode(source, (JSArray)response.get("masks")));
                checkPreparation();
                JSObject timings = new JSObject();
                timings.put("decodeMs", decodedAt-start); timings.put("initializeMs", initializedAt-decodedAt);
                timings.put("detectMs", analyzedAt-initializedAt); timings.put("encodeMs", encodedAt-analyzedAt);
                timings.put("previewMs", android.os.SystemClock.elapsedRealtime()-encodedAt);
                response.put("timings", timings);
                call.resolve(response);
            } catch (Exception error) { call.reject("Lecture de la photo impossible."); }
            finally { if (source != null) source.recycle(); preparationId = ""; busy.set(false); }
        });
    }
    @Override protected void handleOnDestroy(){executor.execute(()->{try{if(model!=null)model.close();}catch(Exception ignored){}});executor.shutdown();}
}
