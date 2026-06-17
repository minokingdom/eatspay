package kr.co.eatspay.app;

import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null) {
                    return;
                }

                getBridge().eval(
                    "window.EATSPAY_HANDLE_ANDROID_BACK && window.EATSPAY_HANDLE_ANDROID_BACK();",
                    null
                );
            }
        });
    }
}
