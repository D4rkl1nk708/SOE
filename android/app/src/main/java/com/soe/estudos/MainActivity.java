package com.soe.estudos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TecBrowserPlugin.class);
        registerPlugin(ExamPdfPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
