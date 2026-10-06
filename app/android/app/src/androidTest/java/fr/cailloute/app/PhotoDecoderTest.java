package fr.cailloute.app;

import android.content.Context;
import android.graphics.*;
import android.media.ExifInterface;
import android.net.Uri;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PhotoDecoderTest {
    @Test public void waitsForSlowExifInsteadOfLosingCoordinates() throws Exception {
        java.util.concurrent.FutureTask<com.getcapacitor.JSObject> task = new java.util.concurrent.FutureTask<>(() -> {
            Thread.sleep(350);
            com.getcapacitor.JSObject point = new com.getcapacitor.JSObject();
            point.put("lat", 45.5); point.put("lon", 4.25); point.put("source", "exif");
            return point;
        });
        new Thread(task).start();
        assertEquals(45.5, CailloutePhotoDecoder.awaitPosition(task).getDouble("lat"), .00001);
    }

    @Test public void blursActualPixelsUpToEdgesAndCapsPreviewSize() throws Exception {
        Bitmap image = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888);
        int[] pixels = new int[640*480];
        java.util.Random random = new java.util.Random(17);
        for (int i=0; i<pixels.length; i++) pixels[i]=Color.rgb(random.nextInt(256), random.nextInt(256), random.nextInt(256));
        image.setPixels(pixels, 0, 640, 0, 0, 640, 480);
        com.getcapacitor.JSArray masks = new com.getcapacitor.JSArray();
        com.getcapacitor.JSObject mask = new com.getcapacitor.JSObject();
        mask.put("x", 0); mask.put("y", 0); mask.put("width", .5); mask.put("height", .5); mask.put("rounded", true); masks.put(mask);
        Bitmap masked = CailloutePhotoPreview.masked(image, masks);
        Bitmap plain = CailloutePhotoPreview.masked(image, new com.getcapacitor.JSArray());
        try {
            assertEquals(plain.getPixel(600, 400), masked.getPixel(600, 400));
            double before=0, after=0;
            for(int y=0;y<119;y++)for(int x=0;x<159;x++) {
                before+=Math.abs(Color.red(plain.getPixel(x,y))-Color.red(plain.getPixel(x+1,y)));
                after+=Math.abs(Color.red(masked.getPixel(x,y))-Color.red(masked.getPixel(x+1,y)));
            }
            assertTrue("Les détails de la région doivent disparaître", after < before*.1);
            byte[] jpeg = android.util.Base64.decode(CailloutePhotoPreview.encode(image, masks).getString("base64"), android.util.Base64.DEFAULT);
            assertTrue(jpeg.length <= 40_000);
            assertEquals("RIFF",new String(jpeg,0,4,java.nio.charset.StandardCharsets.US_ASCII));
            assertEquals("WEBP",new String(jpeg,8,4,java.nio.charset.StandardCharsets.US_ASCII));
            Bitmap decoded=BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
            try { assertTrue(Math.max(decoded.getWidth(),decoded.getHeight())<=960); } finally { decoded.recycle(); }
        } finally { image.recycle(); masked.recycle(); plain.recycle(); }
    }
    @Test public void reducesTwelveMegapixelsAndPreservesOrientationAndGps() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File source = new File(context.getCacheDir(), "qa-photo-decoder.jpg");
        Bitmap original = Bitmap.createBitmap(4000, 3000, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(original); canvas.drawColor(Color.BLUE);
        Paint paint = new Paint(); paint.setColor(Color.RED); canvas.drawRect(0, 0, 2000, 3000, paint);
        try (FileOutputStream output = new FileOutputStream(source)) { original.compress(Bitmap.CompressFormat.JPEG, 95, output); }
        original.recycle();
        ExifInterface exif = new ExifInterface(source.getPath());
        exif.setAttribute(ExifInterface.TAG_ORIENTATION, "6");
        exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE, "45/1,30/1,0/1"); exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF, "N");
        exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE, "4/1,15/1,0/1"); exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF, "E");
        exif.saveAttributes();
        try {
            CailloutePhotoDecoder.Decoded decoded = CailloutePhotoDecoder.read(context, Uri.fromFile(source), true);
            try {
                assertEquals(720, decoded.bitmap.getWidth()); assertEquals(960, decoded.bitmap.getHeight());
                assertTrue(Color.red(decoded.bitmap.getPixel(240, 80)) > 200);
                assertTrue(Color.blue(decoded.bitmap.getPixel(360, 840)) > 200);
                assertNotNull(decoded.position);
                assertEquals(45.5, decoded.position.getDouble("lat"), .00001);
                assertEquals(4.25, decoded.position.getDouble("lon"), .00001);
                ByteArrayOutputStream bytes = new ByteArrayOutputStream(); decoded.bitmap.compress(Bitmap.CompressFormat.JPEG, 88, bytes);
                ExifInterface copy = new ExifInterface(new ByteArrayInputStream(bytes.toByteArray()));
                assertNull(copy.getAttribute(ExifInterface.TAG_GPS_LATITUDE));
            } finally { decoded.bitmap.recycle(); }
        } finally { source.delete(); }
    }
}
