package fr.cailloute.app;

import android.graphics.*;
import android.util.Base64;
import com.getcapacitor.*;
import java.io.ByteArrayOutputStream;
import org.json.JSONObject;

/** Petit flou CPU borné : évite les filtres GPU et les encodages de la WebView. */
final class CailloutePhotoPreview {
    static Bitmap masked(Bitmap source, JSArray masks) throws Exception {
        float scale = Math.min(1f, 960f / Math.max(source.getWidth(), source.getHeight()));
        Bitmap image = Bitmap.createBitmap(Math.max(1, Math.round(source.getWidth()*scale)), Math.max(1, Math.round(source.getHeight()*scale)), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(image); canvas.drawColor(Color.WHITE);
        canvas.drawBitmap(source, null, new Rect(0, 0, image.getWidth(), image.getHeight()), new Paint(Paint.FILTER_BITMAP_FLAG));
        for (int i = 0; i < masks.length(); i++) {
            JSONObject mask = masks.getJSONObject(i);
            int x = Math.max(0, (int)Math.floor(mask.getDouble("x")*image.getWidth()));
            int y = Math.max(0, (int)Math.floor(mask.getDouble("y")*image.getHeight()));
            int right = Math.min(image.getWidth(), (int)Math.ceil((mask.getDouble("x")+mask.getDouble("width"))*image.getWidth()));
            int bottom = Math.min(image.getHeight(), (int)Math.ceil((mask.getDouble("y")+mask.getDouble("height"))*image.getHeight()));
            int width = right-x, height = bottom-y;
            if (width <= 0 || height <= 0) continue;
            int[] pixels = new int[width*height], scratch = new int[pixels.length];
            // Retirer d'abord les détails, puis lisser : le masque agit sur les pixels, pas sur l'alpha.
            Bitmap reduced = Bitmap.createBitmap(Math.min(12, width), Math.min(12, height), Bitmap.Config.ARGB_8888);
            new Canvas(reduced).drawBitmap(image, new Rect(x, y, right, bottom), new Rect(0, 0, reduced.getWidth(), reduced.getHeight()), new Paint(Paint.FILTER_BITMAP_FLAG));
            Bitmap enlarged = Bitmap.createScaledBitmap(reduced, width, height, true);
            enlarged.getPixels(pixels, 0, width, 0, 0, width, height);
            if (enlarged != reduced) enlarged.recycle(); reduced.recycle();
            // Trois passes, bords prolongés : aucun détail original réintroduit dans le masque.
            int radius = Math.max(5, Math.round(Math.min(width, height)*.09f));
            for (int pass = 0; pass < 3; pass++) {
                blur(pixels, scratch, width, height, radius, true);
                blur(scratch, pixels, width, height, radius, false);
            }
            if (mask.optBoolean("rounded") && x > 0 && y > 0 && right < image.getWidth() && bottom < image.getHeight()) {
                Bitmap patch=Bitmap.createBitmap(pixels,width,height,Bitmap.Config.ARGB_8888);
                canvas.save();Path oval=new Path();oval.addOval(new RectF(x,y,right,bottom),Path.Direction.CW);canvas.clipPath(oval);
                canvas.drawBitmap(patch,x,y,new Paint(Paint.FILTER_BITMAP_FLAG));canvas.restore();patch.recycle();
            } else image.setPixels(pixels, 0, width, x, y, width, height);
        }
        return image;
    }
    private static void blur(int[] source, int[] target, int width, int height, int radius, boolean horizontal) {
        int lines = horizontal ? height : width, length = horizontal ? width : height, divisor = radius*2+1;
        for (int line = 0; line < lines; line++) {
            int red = 0, green = 0, blue = 0;
            for (int d = -radius; d <= radius; d++) {
                int at = Math.max(0, Math.min(length-1, d));
                int pixel = source[horizontal ? line*width+at : at*width+line];
                red += Color.red(pixel); green += Color.green(pixel); blue += Color.blue(pixel);
            }
            for (int at = 0; at < length; at++) {
                target[horizontal ? line*width+at : at*width+line] = Color.rgb(red/divisor, green/divisor, blue/divisor);
                int before = Math.max(0, at-radius), after = Math.min(length-1, at+radius+1);
                int old = source[horizontal ? line*width+before : before*width+line];
                int next = source[horizontal ? line*width+after : after*width+line];
                red += Color.red(next)-Color.red(old); green += Color.green(next)-Color.green(old); blue += Color.blue(next)-Color.blue(old);
            }
        }
    }
    static JSObject encode(Bitmap source, JSArray masks) throws Exception {
        Bitmap image = masked(source, masks);
        try {
            for (int attempt = 0; attempt < 12; attempt++) {
                for (int quality : new int[]{90, 85, 80, 75, 70, 65, 60, 55, 50, 45}) {
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream(); image.compress((android.os.Build.VERSION.SDK_INT>=30?Bitmap.CompressFormat.WEBP_LOSSY:Bitmap.CompressFormat.WEBP), quality, bytes);
                    if (bytes.size() <= 40_000) {
                        JSObject result = new JSObject(); result.put("base64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)); result.put("caption", "");
                        return result;
                    }
                }
                Bitmap smaller = Bitmap.createScaledBitmap(image, Math.max(1, Math.round(image.getWidth()*.8f)), Math.max(1, Math.round(image.getHeight()*.8f)), true);
                if (smaller != image) image.recycle(); image = smaller;
            }
            throw new IllegalArgumentException("Aperçu trop lourd");
        } finally { image.recycle(); }
    }
}
