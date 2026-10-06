package fr.cailloute.app;

import android.Manifest;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.app.AlertDialog;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.camera.core.AspectRatio;
import androidx.camera.core.FocusMeteringAction;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.net.Uri;
import android.view.Gravity;
import android.view.ScaleGestureDetector;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraInfo;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.core.ZoomState;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.File;
import java.util.ArrayList;
import java.util.Locale;

/** Une séance conserve plusieurs originaux avant leur revue de confidentialité. */
@CapacitorPlugin(name="CaillouteCamera", permissions={@Permission(alias="camera", strings={Manifest.permission.CAMERA})})
public class CaillouteCameraPlugin extends Plugin {
    private FrameLayout overlay;
    private ProcessCameraProvider provider;
    private PluginCall pending;
    private OnBackPressedCallback back;
    private ImageCapture capture;
    private Camera activeCamera;
    private float zoomRatio=1f;
    private boolean capturing;
    private final ArrayList<String> photos = new ArrayList<>();
    private Button shutter, done, flash, switchCamera;
    private LinearLayout thumbnails;
    private HorizontalScrollView photoRail;
    private int flashMode=ImageCapture.FLASH_MODE_AUTO;
    private final java.util.concurrent.ExecutorService thumbnailWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private boolean front;
    private int maxPhotos;
    private final java.util.Map<String,android.graphics.Bitmap> thumbnailCache=new java.util.HashMap<>();
    private TextView zoomLabel;
    private int dp(int value){return Math.round(value*getContext().getResources().getDisplayMetrics().density);}
    private GradientDrawable rounded(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private Button control(String text,String label){
        Button b=new Button(getContext());b.setText(text);b.setContentDescription(label);b.setTextColor(Color.WHITE);
        b.setAllCaps(false);b.setTextSize(15);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(0);b.setMinimumHeight(0);
        b.setPadding(dp(12),0,dp(12),0);b.setBackground(rounded(0xff242424,24));
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-2,dp(48));params.setMargins(dp(4),dp(4),dp(4),dp(4));b.setLayoutParams(params);return b;
    }
    private LinearLayout zooms;
    private final java.util.Map<Button, Float> zoomButtons = new java.util.HashMap<>();
    private PreviewView view;
    private CameraSelector selected = CameraSelector.DEFAULT_BACK_CAMERA;

    private String zoomText(float ratio){return String.format(Locale.US,ratio==Math.round(ratio)?"%.0fx":"%.1fx",ratio);}
    private void updateZoomButtons(){
        for(var entry:zoomButtons.entrySet()){
            boolean active=Math.abs(entry.getValue()-zoomRatio)<.06f;
            entry.getKey().setTextColor(active?Color.BLACK:Color.WHITE);
            entry.getKey().setBackground(rounded(active?0xffeeeeee:Color.TRANSPARENT,30));
            entry.getKey().setSelected(active);
        }
    }
    private Button iconControl(String glyph,String label){
        Button button=control("",label);button.setBackground(new CameraGlyph(glyph,glyph.equals("flash")?"A":""));
        button.setLayoutParams(new LinearLayout.LayoutParams(dp(56),dp(56)));return button;
    }
    private class CameraGlyph extends android.graphics.drawable.Drawable {
        private final String glyph, annotation;
        CameraGlyph(String glyph,String annotation){this.glyph=glyph;this.annotation=annotation;}
        @Override public void draw(android.graphics.Canvas canvas){
            var bounds=getBounds();canvas.save();canvas.translate(bounds.centerX()-dp(14),bounds.centerY()-dp(14));canvas.scale(dp(28)/28f,dp(28)/28f);
            android.graphics.Paint paint=new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);paint.setColor(Color.WHITE);paint.setStrokeWidth(2.4f);paint.setStyle(android.graphics.Paint.Style.STROKE);
            if(glyph.equals("close")){canvas.drawLine(3,3,25,25,paint);canvas.drawLine(25,3,3,25,paint);}
            else if(glyph.equals("flash")){
                android.graphics.Path path=new android.graphics.Path();path.moveTo(10,1);path.lineTo(20,1);path.lineTo(14,12);path.lineTo(21,12);path.lineTo(8,27);path.lineTo(11,16);path.lineTo(5,16);path.close();paint.setStyle(android.graphics.Paint.Style.FILL);canvas.drawPath(path,paint);
                paint.setTextSize(11);canvas.drawText(annotation,21,10,paint);
            } else {
                canvas.drawRoundRect(5,8,23,22,3,3,paint);canvas.drawCircle(14,15,4,paint);canvas.drawArc(1,1,27,27,215,120,false,paint);canvas.drawLine(24,4,25,10,paint);canvas.drawLine(25,10,19,8,paint);
            }
            canvas.restore();
        }
        @Override public void setAlpha(int alpha){} @Override public void setColorFilter(android.graphics.ColorFilter filter){}
        @Override public int getOpacity(){return android.graphics.PixelFormat.TRANSLUCENT;}
    }
    private void message(String text){
        if(overlay==null)return;
        boolean dark=((MainActivity)getActivity()).isDark(getContext().getSharedPreferences("cailloute-appearance",0).getString("theme","system"));
        TextView bubble=new TextView(getContext());bubble.setText(text);bubble.setTextSize(14);bubble.setTextColor(Color.parseColor(dark?"#f0f4ff":"#111746"));bubble.setPadding(dp(16),dp(12),dp(16),dp(12));
        GradientDrawable background=rounded(Color.parseColor(dark?"#192338":"#ffffff"),16);background.setStroke(dp(1),Color.parseColor(dark?"#34435f":"#e0e6f1"));bubble.setBackground(background);
        FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(-2,-2,Gravity.CENTER);overlay.addView(bubble,params);
        bubble.postDelayed(()->{if(bubble.getParent() instanceof ViewGroup)((ViewGroup)bubble.getParent()).removeView(bubble);},3000);
    }

    @PluginMethod public void takePhoto(PluginCall call) {
        if (pending != null) { call.reject("La caméra est déjà ouverte."); return; }
        if (getPermissionState("camera") != PermissionState.GRANTED) { requestPermissionForAlias("camera", call, "cameraPermission"); return; }
        getActivity().runOnUiThread(() -> open(call));
    }
    @PermissionCallback private void cameraPermission(PluginCall call) {
        if(getPermissionState("camera") == PermissionState.GRANTED) takePhoto(call);
        else call.reject("Autorisez l’accès à l’appareil photo dans les réglages Android.");
    }
    private void open(PluginCall call) {
        androidx.core.view.WindowCompat.getInsetsController(getActivity().getWindow(),getActivity().getWindow().getDecorView()).hide(WindowInsetsCompat.Type.systemBars());
        thumbnailCache.clear();pending=call;maxPhotos=Math.max(1,Math.min(30,call.getInt("limit",20))); photos.clear(); capturing=false;front=false;flashMode=ImageCapture.FLASH_MODE_AUTO;zoomButtons.clear();
        overlay=new FrameLayout(getContext()); overlay.setBackgroundColor(Color.BLACK);
        view=new PreviewView(getContext());view.setScaleType(PreviewView.ScaleType.FIT_CENTER); view.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        ScaleGestureDetector pinch=new ScaleGestureDetector(getContext(),new ScaleGestureDetector.SimpleOnScaleGestureListener(){
            @Override public boolean onScaleBegin(ScaleGestureDetector detector){return activeCamera!=null&&!capturing;}
            @Override public boolean onScale(ScaleGestureDetector detector){
                if(activeCamera==null||capturing)return false;
                ZoomState state=activeCamera.getCameraInfo().getZoomState().getValue();
                if(state==null)return false;
                float requested=zoomRatio*detector.getScaleFactor();
                if(Float.isFinite(requested))setZoom(Math.max(state.getMinZoomRatio(),Math.min(state.getMaxZoomRatio(),requested)),false);
                return true;
            }
        });
        final boolean[] scaled={false};
        view.setOnTouchListener((v,event)->{
            if(event.getActionMasked()==MotionEvent.ACTION_DOWN)scaled[0]=false;
            if(event.getPointerCount()>1)scaled[0]=true;
            pinch.onTouchEvent(event);
            if(event.getActionMasked()==MotionEvent.ACTION_UP){
                v.performClick();
                if(!scaled[0]&&activeCamera!=null&&!capturing){
                    var point=view.getMeteringPointFactory().createPoint(event.getX(),event.getY());
                    activeCamera.getCameraControl().startFocusAndMetering(new FocusMeteringAction.Builder(point).build());
                }
            }
            return true;
        });
        LinearLayout layout=new LinearLayout(getContext());layout.setOrientation(LinearLayout.VERTICAL);
        overlay.addView(layout,new FrameLayout.LayoutParams(-1,-1));
        ViewCompat.setOnApplyWindowInsetsListener(layout,(v,insets)->{var bars=insets.getInsets(WindowInsetsCompat.Type.systemBars());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
        LinearLayout top=new LinearLayout(getContext());top.setGravity(Gravity.CENTER_VERTICAL);top.setPadding(dp(8),dp(4),dp(8),dp(4));
        Button cancel=iconControl("close","Fermer la caméra");top.addView(cancel);
        android.view.View space=new android.view.View(getContext());top.addView(space,new LinearLayout.LayoutParams(0,1,1));
        flash=iconControl("flash","Flash automatique");top.addView(flash);
        switchCamera=iconControl("switch","Changer de caméra");top.addView(switchCamera);layout.addView(top);
        FrameLayout previewSpace=new FrameLayout(getContext());layout.addView(previewSpace,new LinearLayout.LayoutParams(-1,0,1));
        previewSpace.addView(view,new FrameLayout.LayoutParams(-1,-1,Gravity.CENTER));
        previewSpace.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{
            int width=Math.min(r-l,(b-t)*3/4),height=width*4/3;
            if(width>0&&(view.getLayoutParams().width!=width||view.getLayoutParams().height!=height))view.setLayoutParams(new FrameLayout.LayoutParams(width,height,Gravity.CENTER));
        });
        LinearLayout panel=new LinearLayout(getContext());panel.setOrientation(LinearLayout.VERTICAL);panel.setGravity(Gravity.CENTER);panel.setPadding(dp(8),dp(4),dp(8),dp(12));
        thumbnails=new LinearLayout(getContext());photoRail=new HorizontalScrollView(getContext());photoRail.setHorizontalScrollBarEnabled(false);photoRail.addView(thumbnails);photoRail.setVisibility(android.view.View.GONE);FrameLayout.LayoutParams railParams=new FrameLayout.LayoutParams(-1,dp(80),Gravity.BOTTOM);railParams.bottomMargin=dp(8);previewSpace.addView(photoRail,railParams);
        zooms=new LinearLayout(getContext());zooms.setGravity(Gravity.CENTER);
        HorizontalScrollView zoomScroll=new HorizontalScrollView(getContext());zoomScroll.setHorizontalScrollBarEnabled(false);zoomScroll.setFillViewport(true);zoomScroll.addView(zooms);panel.addView(zoomScroll);
        zoomLabel=new TextView(getContext());zoomLabel.setTextColor(Color.WHITE);zoomLabel.setGravity(Gravity.CENTER);zoomLabel.setVisibility(android.view.View.GONE);
        shutter=control("","Prendre une photo");shutter.setEnabled(false);
        GradientDrawable outer=rounded(Color.BLACK,48);outer.setStroke(dp(3),Color.WHITE);
        GradientDrawable inner=rounded(Color.WHITE,48);
        android.graphics.drawable.LayerDrawable shutterDrawable=new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[]{outer,new android.graphics.drawable.InsetDrawable(inner,dp(8))});
        shutter.setBackground(shutterDrawable);
        FrameLayout actions=new FrameLayout(getContext());panel.addView(actions,new LinearLayout.LayoutParams(-1,dp(116)));
        actions.addView(shutter,new FrameLayout.LayoutParams(dp(88),dp(88),Gravity.CENTER));
        done=control("Valider · 0","Valider les photos");done.setTextSize(13);done.setPadding(dp(8),0,dp(8),0);done.setEnabled(false);done.setVisibility(android.view.View.INVISIBLE);
        FrameLayout.LayoutParams doneParams=new FrameLayout.LayoutParams(dp(84),dp(48),Gravity.RIGHT|Gravity.CENTER_VERTICAL);doneParams.rightMargin=dp(4);actions.addView(done,doneParams);
        layout.addView(panel);getActivity().addContentView(overlay,new ViewGroup.LayoutParams(-1,-1));ViewCompat.requestApplyInsets(layout);
        back=new OnBackPressedCallback(true){ @Override public void handleOnBackPressed(){requestClose();} };
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(),back);
        cancel.setOnClickListener(v -> requestClose());done.setOnClickListener(v -> finish());
        flash.setOnClickListener(v->{if(capture==null||capturing||activeCamera==null||!activeCamera.getCameraInfo().hasFlashUnit())return;
            flashMode=flashMode==ImageCapture.FLASH_MODE_AUTO?ImageCapture.FLASH_MODE_ON:flashMode==ImageCapture.FLASH_MODE_ON?ImageCapture.FLASH_MODE_OFF:ImageCapture.FLASH_MODE_AUTO;
            capture.setFlashMode(flashMode);flash.setBackground(new CameraGlyph("flash",flashMode==ImageCapture.FLASH_MODE_AUTO?"A":flashMode==ImageCapture.FLASH_MODE_OFF?"×":""));flash.setContentDescription(flashMode==ImageCapture.FLASH_MODE_AUTO?"Flash automatique":flashMode==ImageCapture.FLASH_MODE_ON?"Flash activé":"Flash désactivé");
        });
        switchCamera.setOnClickListener(v->{if(capturing||provider==null)return;CameraSelector previous=selected;
            try{bind(front?CameraSelector.DEFAULT_BACK_CAMERA:CameraSelector.DEFAULT_FRONT_CAMERA);front=!front;}
            catch(Exception e){try{bind(previous);}catch(Exception ignored){}message("Caméra indisponible");}
        });
        var future=ProcessCameraProvider.getInstance(getContext());
        future.addListener(() -> {
            if(pending != call) return;
            try {
                provider=future.get();bind(CameraSelector.DEFAULT_BACK_CAMERA);switchCamera.setVisibility(provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)?android.view.View.VISIBLE:android.view.View.GONE);
            } catch(Exception e){close(); call.reject("Caméra indisponible. Réessayez ou utilisez la galerie.",e);}
        },ContextCompat.getMainExecutor(getContext()));
        shutter.setOnClickListener(v -> shoot(call));
    }
    private void bind(CameraSelector selector) {
        shutter.setEnabled(false);activeCamera=null;provider.unbindAll();
        Preview preview=new Preview.Builder().setTargetAspectRatio(AspectRatio.RATIO_4_3).build();preview.setSurfaceProvider(view.getSurfaceProvider());
        capture=new ImageCapture.Builder().setTargetAspectRatio(AspectRatio.RATIO_4_3).setFlashMode(flashMode).setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build();
        Camera camera=provider.bindToLifecycle(getActivity(),selector,preview,capture);activeCamera=camera;selected=selector;flash.setEnabled(camera.getCameraInfo().hasFlashUnit());
        zooms.removeAllViews();zoomButtons.clear();
        ZoomState state=camera.getCameraInfo().getZoomState().getValue();
        if(state!=null){
            zoomRatio=state.getZoomRatio();zoomLabel.setText(String.format(Locale.FRANCE,"%.1f×",zoomRatio));
            java.util.TreeSet<Float> ratios=new java.util.TreeSet<>();
            ratios.add(state.getMinZoomRatio());
            for(float ratio:new float[]{.6f,1f,2f,5f,10f}) if(ratio>=state.getMinZoomRatio()&&ratio<=state.getMaxZoomRatio())ratios.add(ratio);
            for(float ratio:ratios){
                Button button=control(zoomText(ratio),"Zoom "+zoomText(ratio));button.setPadding(0,0,0,0);zooms.addView(button,new LinearLayout.LayoutParams(dp(54),dp(54)));zoomButtons.put(button,ratio);
                button.setOnClickListener(v->{if(!capturing)setZoom(ratio,true);});
            }
        }
        updateZoomButtons();shutter.setEnabled(true);
    }
    private void setZoom(float ratio,boolean showError){
        Camera camera=activeCamera;if(camera==null)return;
        zoomRatio=ratio;updateZoomButtons();zoomLabel.setText(String.format(Locale.FRANCE,"%.1f×",ratio));
        var operation=camera.getCameraControl().setZoomRatio(ratio);
        operation.addListener(()->{
            try{operation.get();}catch(Exception e){
                // Une commande plus récente peut annuler la précédente pendant le geste.
                if(showError&&activeCamera==camera)message("Zoom indisponible");
            }
        },ContextCompat.getMainExecutor(getContext()));
    }
    private void shoot(PluginCall call){
        if(capture==null||capturing||photos.size()>=maxPhotos)return;capturing=true;shutter.setEnabled(false);done.setEnabled(false);
        try{
            File folder=new File(getContext().getFilesDir(),"captures");if(!folder.exists()&&!folder.mkdirs())throw new java.io.IOException("Dossier inaccessible");
            File photo=File.createTempFile("cailloute-",".jpg",folder);
            capture.setTargetRotation(view.getDisplay().getRotation());
            ImageCapture.Metadata metadata=new ImageCapture.Metadata();
            try {
            if(ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACCESS_FINE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACCESS_COARSE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED){
                android.location.LocationManager manager=(android.location.LocationManager)getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
                android.location.Location latest=null;
                for(String source:manager.getProviders(true)){
                    android.location.Location candidate=manager.getLastKnownLocation(source);
                    if(candidate!=null && android.os.SystemClock.elapsedRealtimeNanos()-candidate.getElapsedRealtimeNanos()<30_000_000_000L && (latest==null || candidate.getElapsedRealtimeNanos()>latest.getElapsedRealtimeNanos()))latest=candidate;
                }
                if(latest!=null)metadata.setLocation(latest);
            }
            } catch(SecurityException ignored) { /* Une position refusée ne doit pas empêcher la photo. */ }
            capture.takePicture(new ImageCapture.OutputFileOptions.Builder(photo).setMetadata(metadata).build(),ContextCompat.getMainExecutor(getContext()),new ImageCapture.OnImageSavedCallback(){
                @Override public void onImageSaved(ImageCapture.OutputFileResults result){
                    if(pending!=call)return;
                    photos.add(Uri.fromFile(photo).toString());ready();
                    refreshPhotos();
                }
                @Override public void onError(ImageCaptureException e){photo.delete();if(pending==call){ready();message("Photo non prise. Réessayez.");}}
            });
        }catch(Exception e){ready();message("Enregistrement impossible");}
    }
    private void refreshPhotos(){
        done.setVisibility(photos.isEmpty()?android.view.View.INVISIBLE:android.view.View.VISIBLE);
        shutter.setEnabled(!capturing&&activeCamera!=null&&photos.size()<maxPhotos);
        done.setText("Valider · "+photos.size());done.setEnabled(!capturing&&!photos.isEmpty());
        thumbnails.removeAllViews();photoRail.setVisibility(photos.isEmpty()?android.view.View.GONE:android.view.View.VISIBLE);
        for(String uri:new ArrayList<>(photos)){
            FrameLayout item=new FrameLayout(getContext());LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(dp(76),dp(76));params.setMargins(dp(4),0,dp(4),0);thumbnails.addView(item,params);
            ImageView image=new ImageView(getContext());image.setScaleType(ImageView.ScaleType.CENTER_CROP);image.setContentDescription("Photo prise");item.addView(image,new FrameLayout.LayoutParams(-1,-1));
            Button remove=control("×","Supprimer cette photo");remove.setPadding(0,0,0,0);item.addView(remove,new FrameLayout.LayoutParams(dp(40),dp(40),Gravity.TOP|Gravity.RIGHT));
            remove.setOnClickListener(v->{if(capturing)return;photos.remove(uri);thumbnailCache.remove(uri);new File(Uri.parse(uri).getPath()).delete();refreshPhotos();});
            if(thumbnailCache.containsKey(uri)){image.setImageBitmap(thumbnailCache.get(uri));continue;}
            thumbnailWorker.execute(()->{try{var decoded=CailloutePhotoDecoder.read(getContext(),Uri.parse(uri),false,160);getActivity().runOnUiThread(()->{if(pending!=null&&photos.contains(uri)){thumbnailCache.put(uri,decoded.bitmap);if(image.isAttachedToWindow())image.setImageBitmap(decoded.bitmap);}else decoded.bitmap.recycle();});}catch(Exception ignored){}});
        }
        photoRail.post(()->photoRail.fullScroll(android.view.View.FOCUS_RIGHT));
    }
    private void requestClose(){
        if(capturing)return;
        if(photos.isEmpty()){finish();return;}
        new AlertDialog.Builder(getActivity()).setTitle("Photos non validées").setMessage(photos.size()+" photo(s) prises dans cette session.")
            .setNeutralButton("Continuer",(d,w)->{}).setPositiveButton("Utiliser",(d,w)->finish())
            .setNegativeButton("Abandonner",(d,w)->{for(String uri:photos)new File(Uri.parse(uri).getPath()).delete();photos.clear();finish();}).show();
    }
    private void ready(){capturing=false;shutter.setEnabled(activeCamera!=null&&photos.size()<maxPhotos);done.setEnabled(!photos.isEmpty());}
    private void finish(){
        if(capturing)return;
        PluginCall call=pending;if(call==null)return;
        JSObject result=new JSObject();JSArray files=new JSArray();
        for(String uri:photos){JSObject file=new JSObject();file.put("uri",uri);files.put(file);}
        result.put("files",files);boolean empty=photos.isEmpty();close();
        if(empty)call.reject("Prise de photo annulée");else call.resolve(result);
    }
    private void close(){
        if(overlay!=null)androidx.core.view.WindowCompat.getInsetsController(getActivity().getWindow(),getActivity().getWindow().getDecorView()).show(WindowInsetsCompat.Type.systemBars());
        pending=null;activeCamera=null;thumbnailCache.clear();
        if(provider!=null){provider.unbindAll();provider=null;}capture=null;
        if(back!=null){back.remove();back=null;}
        if(overlay!=null){ViewGroup parent=(ViewGroup)overlay.getParent();if(parent!=null)parent.removeView(overlay);overlay=null;}
    }
    @Override protected void handleOnDestroy(){PluginCall call=pending;close();if(call!=null)call.reject("Caméra fermée. Les originaux déjà pris sont conservés sur l’appareil.");}
}
