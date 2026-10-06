import java.awt.Font;
import java.awt.font.FontRenderContext;
import java.awt.geom.PathIterator;
import java.awt.geom.AffineTransform;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

// Ressource vectorielle : le nom et la version sont disponibles avant le démarrage du processus.
class LaunchBranding {
    static String text(String text, int size, int style, float baseline) {
        var font = new Font("SansSerif", style, size);
        var glyph = font.createGlyphVector(new FontRenderContext(null, true, true), text);
        var bounds = glyph.getVisualBounds();
        var transform = AffineTransform.getTranslateInstance(100 - bounds.getCenterX(), baseline);
        var iterator = glyph.getOutline().getPathIterator(transform);
        var path = new StringBuilder();
        float[] values = new float[6];
        while (!iterator.isDone()) {
            int type = iterator.currentSegment(values);
            String command = switch(type) { case 0 -> "M"; case 1 -> "L"; case 2 -> "Q"; case 3 -> "C"; default -> "Z"; };
            int count = switch(type) { case 0, 1 -> 2; case 2 -> 4; case 3 -> 6; default -> 0; };
            path.append(command);
            for(int i=0; i<count; i++) path.append(String.format(Locale.ROOT, "%.2f", values[i])).append(' ');
            iterator.next();
        }
        return "<path android:fillColor=\"@color/cailloute_launch_text\" android:pathData=\""+path+"\"/>";
    }
    public static void main(String[] args) throws Exception {
        Files.writeString(Path.of(args[0]), "<vector xmlns:android=\"http://schemas.android.com/apk/res/android\" android:width=\"200dp\" android:height=\"80dp\" android:viewportWidth=\"200\" android:viewportHeight=\"80\">"
            + text("Cailloute", 32, Font.BOLD, 35) + text("Version " + args[1], 14, Font.PLAIN, 61) + "</vector>");
    }
}
