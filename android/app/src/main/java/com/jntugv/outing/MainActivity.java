package com.jntugv.outing;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom native plugin (permissions + shake SOS). Must be registered before super.onCreate().
        registerPlugin(OutingNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
