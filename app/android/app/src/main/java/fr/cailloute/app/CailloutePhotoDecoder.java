package fr.cailloute.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.Manifest;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import java.io.InputStream;
import java.util.concurrent.*;

/** Réduit pendant le décodage : aucun original ni fichier temporaire en WebView. */
final class CailloutePhotoDecoder {
    static final int MAX_SIZE = 960;
    private static final ThreadPoolExecutor metadata = new ThreadPoolExecutor(0, 1, 15, TimeUnit.SECONDS,
        new SynchronousQueue<>(), task -> { Thread thread = new Thread(task, "cailloute-photo-metadata"); thread.setDaemon(true); return thread; });
    private static JSObject position(Context context, Uri uri) throws Exception {
        if (Build.VERSION.SDK_INT >= 29 && context.checkSelfPermission(Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            try {
                Uri media = "media".equals(uri.getAuthority()) ? uri : MediaStore.getMediaUri(context, uri);
                if (media != null) {
                    JSObject point = readPosition(context, MediaStore.setRequireOriginal(media));
                    if (point != null) return point;
                }
            } catch (Exception ignored) { /* Fournisseur externe : lecture du document original sélectionné. */ }
        }
        return readPosition(context, uri);
    }
    private static JSObject readPosition(Context context, Uri uri) throws Exception {
        try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
            ExifInterface exif = new ExifInterface(stream);
            float[] point = new float[2];
            if (!exif.getLatLong(point)) return null;
            JSObject value = new JSObject(); value.put("lat", point[0]); value.put("lon", point[1]); value.put("source", "exif");
            return value;
        }
    }
    static JSObject awaitPosition(Future<JSObject> gps) throws Exception {
        return gps.get(5, TimeUnit.SECONDS);
    }
    static final class Decoded {
        final Bitmap bitmap;
        final JSObject position;
        Decoded(Bitmap bitmap, JSObject position) { this.bitmap = bitmap; this.position = position; }
    }
    static Decoded read(Context context, Uri uri, boolean includePosition) throws Exception {
        return read(context, uri, includePosition, MAX_SIZE);
    }
    static Decoded read(Context context, Uri uri, boolean includePosition, int maxSize) throws Exception {
        JSObject position = null;
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        Future<JSObject> gps = null;
        if (includePosition && Build.VERSION.SDK_INT >= 28) {
            try { gps = metadata.submit(() -> position(context, uri)); } catch (RejectedExecutionException ignored) {}
        }
        // Pas de seconde lecture EXIF quand l'adresse n'est pas demandée sur Android récent.
        if (Build.VERSION.SDK_INT < 28) {
            try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
                ExifInterface exif = new ExifInterface(stream);
                orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                float[] point = new float[2];
                if (includePosition && exif.getLatLong(point)) {
                    position = new JSObject(); position.put("lat", point[0]); position.put("lon", point[1]); position.put("source", "exif");
                }
            } catch (Exception ignored) { /* La photo reste utilisable sans GPS. */ }
        }
        Bitmap bitmap;
        if (Build.VERSION.SDK_INT >= 28) {
            bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.getContentResolver(), uri), (decoder, info, source) -> {
                int width = info.getSize().getWidth(), height = info.getSize().getHeight();
                float scale = Math.min(1f, maxSize / (float)Math.max(width, height));
                decoder.setTargetSize(Math.max(1, Math.round(width*scale)), Math.max(1, Math.round(height*scale)));
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
            });
        } else {
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
            try (InputStream stream = context.getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(stream, null, options); }
            options.inSampleSize = 1;
            while (Math.max(options.outWidth, options.outHeight) / (options.inSampleSize * 2) >= maxSize) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            try (InputStream stream = context.getContentResolver().openInputStream(uri)) { bitmap = BitmapFactory.decodeStream(stream, null, options); }
            if (bitmap == null) throw new IllegalArgumentException("Photo illisible");
            Matrix matrix = new Matrix();
            switch (orientation) {
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180); break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1, -1); break;
                case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90); break;
                case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(270); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(270); break;
            }
            float scale = Math.min(1f, maxSize / (float)Math.max(bitmap.getWidth(), bitmap.getHeight()));
            matrix.postScale(scale, scale);
            Bitmap oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (oriented != bitmap) bitmap.recycle();
            bitmap = oriented;
        }
        if (gps != null) {
            try { position = awaitPosition(gps); }
            catch (Exception ignored) { gps.cancel(true); }
        }
        return new Decoded(bitmap, position);
    }
}
