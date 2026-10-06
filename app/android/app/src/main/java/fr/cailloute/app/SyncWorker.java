package fr.cailloute.app;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
public final class SyncWorker extends Worker {
    public SyncWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
    @NonNull public Result doWork(){try(SyncQueue queue=new SyncQueue(getApplicationContext())){return queue.flush()?Result.success():Result.retry();}}
}
