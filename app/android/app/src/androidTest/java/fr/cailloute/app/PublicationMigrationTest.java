package fr.cailloute.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Vérifie les données fictives conservées lors des mises à jour successives. */
@RunWith(AndroidJUnit4.class)
public class PublicationMigrationTest {
    private String evaluate(Instrumentation instrumentation, WebView web, String expression) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> web.evaluateJavascript(expression, result -> { value.set(result); latch.countDown(); }));
        assertTrue("Réponse WebView attendue", latch.await(10, TimeUnit.SECONDS));
        return value.get();
    }
    @Test public void preservesPrivateDataAfterSignatureRotation() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        WebView web = ((BridgeActivity) activity).getBridge().getWebView();
        long deadline = System.currentTimeMillis() + 45000;
        while (System.currentTimeMillis() < deadline && !"true".equals(evaluate(instrumentation, web, "performance.getEntriesByName('cailloute:ready').length > 0"))) Thread.sleep(250);
        assertEquals("true", evaluate(instrumentation, web, "performance.getEntriesByName('cailloute:ready').length > 0"));
        evaluate(instrumentation, web, "(async()=>{try{const db=await new Promise((r,j)=>{const q=indexedDB.open('Cailloute');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const values={};for(const name of ['places','details','personal','favorites','freeQueue'])values[name]=await new Promise((r,j)=>{const q=db.transaction(name).objectStore(name).get(name==='freeQueue'?'migration-queue':'c_publication_preserve');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();window.__migrationResult={records:JSON.stringify(values),marker:localStorage.getItem('qa-publication')};}catch(e){window.__migrationResult={error:String(e)}}})(); true");
        String result = "null";
        deadline = System.currentTimeMillis() + 15000;
        while (System.currentTimeMillis() < deadline) { result = evaluate(instrumentation, web, "window.__migrationResult || null"); if (!"null".equals(result)) break; Thread.sleep(100); }
        JSONObject data = new JSONObject(result);
        assertFalse(data.toString(), data.has("error"));
        String expected = new String(instrumentation.getContext().getAssets().open("migration-fixture.json").readAllBytes(), StandardCharsets.UTF_8);
        assertEquals(expected, data.getString("records"));
        assertEquals("DONNEES-FICTIVES-063", data.getString("marker"));
        // Les commandes sont exercées dans la véritable WebView release.
        for (String label : new String[]{"Profil", "Favoris", "Carte"}) {
            assertEquals("true", evaluate(instrumentation, web, "(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='"+label+"');if(!b)return false;b.click();return true;})()"));
            Thread.sleep(400);
            if (label.equals("Profil")) assertEquals("true", evaluate(instrumentation, web, "document.body.textContent.includes('version " + BuildConfig.VERSION_NAME + "')"));
        }
        assertEquals("true", evaluate(instrumentation, web, "!!document.querySelector('.leaflet-container')"));
        activity.finish();
    }
}
