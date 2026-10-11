package com.soe.estudos;

import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

@CapacitorPlugin(name = "TecBrowser")
public class TecBrowserPlugin extends Plugin {

    private Dialog dialog;
    private WebView webView;
    private ProgressBar progressBar;
    private String cachedScript = null;

    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            getContext().getResources().getDisplayMetrics()
        );
    }

    @PluginMethod
    public void open(PluginCall call) {
        String targetUrl = call.getString("url", "https://www.tecconcursos.com.br/");

        getActivity().runOnUiThread(() -> {
            try {
                if (dialog != null && dialog.isShowing()) {
                    if (webView != null) {
                        webView.loadUrl(targetUrl);
                    }
                    call.resolve();
                    return;
                }

                Context context = getActivity();
                dialog = new Dialog(context, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
                dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

                Window window = dialog.getWindow();
                if (window != null) {
                    window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                    window.clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
                }

                LinearLayout root = new LinearLayout(context);
                root.setOrientation(LinearLayout.VERTICAL);
                root.setBackgroundColor(Color.parseColor("#0f172a"));
                root.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));

                // ── Header Bar Slim & Sutil ──────────────────────────────────
                LinearLayout header = new LinearLayout(context);
                header.setOrientation(LinearLayout.HORIZONTAL);
                header.setGravity(Gravity.CENTER_VERTICAL);
                header.setBackgroundColor(Color.parseColor("#0f172a"));
                header.setPadding(dpToPx(12), dpToPx(4), dpToPx(12), dpToPx(4));
                header.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dpToPx(44)
                ));

                // Botão Fechar
                Button btnClose = new Button(context);
                btnClose.setText("✕ Fechar");
                btnClose.setTextColor(Color.WHITE);
                btnClose.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
                btnClose.setAllCaps(false);
                GradientDrawable closeBg = new GradientDrawable();
                closeBg.setColor(Color.parseColor("#1e293b"));
                closeBg.setCornerRadius(dpToPx(6));
                btnClose.setBackground(closeBg);
                btnClose.setPadding(dpToPx(10), dpToPx(2), dpToPx(10), dpToPx(2));
                btnClose.setOnClickListener(v -> dialog.dismiss());
                header.addView(btnClose);

                // Título central
                TextView tvTitle = new TextView(context);
                tvTitle.setText("TEC Concursos");
                tvTitle.setTextColor(Color.WHITE);
                tvTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
                tvTitle.setGravity(Gravity.CENTER);
                tvTitle.setTypeface(null, android.graphics.Typeface.BOLD);
                LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
                tvTitle.setLayoutParams(titleLp);
                header.addView(tvTitle);

                // Botão Sincronizar
                Button btnSync = new Button(context);
                btnSync.setText("🔄 Sync");
                btnSync.setTextColor(Color.WHITE);
                btnSync.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
                btnSync.setAllCaps(false);
                GradientDrawable syncBg = new GradientDrawable();
                syncBg.setColor(Color.parseColor("#334155"));
                syncBg.setCornerRadius(dpToPx(6));
                btnSync.setBackground(syncBg);
                btnSync.setPadding(dpToPx(8), dpToPx(2), dpToPx(8), dpToPx(2));
                btnSync.setOnClickListener(v -> {
                    if (webView != null) {
                        webView.evaluateJavascript("window.postMessage({ type: 'SOE_FORCE_SCRAPE', _soe_internal: true }, '*');", null);
                    }
                });
                header.addView(btnSync);

                root.addView(header);

                // ── Progress Bar ──────────────────────────────────────────────
                progressBar = new ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal);
                progressBar.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dpToPx(3)
                ));
                progressBar.setMax(100);
                progressBar.setProgress(0);
                root.addView(progressBar);

                // ── WebView ───────────────────────────────────────────────────
                webView = new WebView(context);
                LinearLayout.LayoutParams webViewLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1.0f
                );
                webView.setLayoutParams(webViewLp);
                webView.setBackgroundColor(Color.WHITE);

                WebSettings ws = webView.getSettings();
                ws.setJavaScriptEnabled(true);
                ws.setDomStorageEnabled(true);
                ws.setDatabaseEnabled(true);
                ws.setAllowFileAccess(false);
                ws.setAllowContentAccess(false);
                ws.setSupportMultipleWindows(false);
                ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                ws.setUseWideViewPort(true);
                ws.setLoadWithOverviewMode(true);
                ws.setCacheMode(WebSettings.LOAD_DEFAULT);
                ws.setUserAgentString(ws.getUserAgentString() + " SOE-Mobile-Native/6.0");

                CookieManager cm = CookieManager.getInstance();
                cm.setAcceptCookie(true);
                cm.setAcceptThirdPartyCookies(webView, true);

                webView.addJavascriptInterface(new SoeNativeBridge(), "SoeAndroidBridge");

                webView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onProgressChanged(WebView view, int newProgress) {
                        if (progressBar != null) {
                            if (newProgress < 100) {
                                progressBar.setVisibility(View.VISIBLE);
                                progressBar.setProgress(newProgress);
                            } else {
                                progressBar.setVisibility(View.GONE);
                            }
                        }
                    }
                });

                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        injectScript(view);
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        return false;
                    }
                });

                root.addView(webView);
                dialog.setContentView(root);

                // Interceptar botão voltar de hardware
                dialog.setOnKeyListener((d, keyCode, event) -> {
                    if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                            return true;
                        }
                        dialog.dismiss();
                        return true;
                    }
                    return false;
                });

                dialog.setOnDismissListener(d -> {
                    CookieManager.getInstance().flush();
                    notifyListeners("browserClosed", new JSObject());
                    if (webView != null) {
                        webView.destroy();
                        webView = null;
                    }
                    dialog = null;
                });

                dialog.show();
                webView.loadUrl(targetUrl);
                call.resolve();

            } catch (Exception e) {
                call.reject("Erro ao abrir navegador TEC: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (dialog != null && dialog.isShowing()) {
                dialog.dismiss();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void sync(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.postMessage({ type: 'SOE_FORCE_SCRAPE', _soe_internal: true }, '*');", null);
            }
            call.resolve();
        });
    }

    private void injectScript(WebView view) {
        if (cachedScript == null) {
            try {
                InputStream is = getContext().getAssets().open("tec-content.js");
                BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
                reader.close();
                cachedScript = sb.toString();
            } catch (Exception e) {
                e.printStackTrace();
                return;
            }
        }

        String wrapper =
            "(function() {\n" +
            "  if (window.__SOE_INJECTED_MOBILE__) return;\n" +
            "  window.__SOE_INJECTED_MOBILE__ = true;\n" +
            "  window.__SOE_MOBILE__ = true;\n" +
            "  window.name = 'TEC_MAIN_FRAME';\n" +
            "  const _origPost = window.postMessage;\n" +
            "  window.postMessage = function(data, targetOrigin) {\n" +
            "    if (data && data._soe_internal && window.SoeAndroidBridge) {\n" +
            "      try { window.SoeAndroidBridge.postMessage(JSON.stringify(data)); } catch(e) {}\n" +
            "    }\n" +
            "    return _origPost.apply(this, arguments);\n" +
            "  };\n" +
            cachedScript + "\n" +
            "})();";

        view.evaluateJavascript(wrapper, null);
    }

    public class SoeNativeBridge {
        @JavascriptInterface
        public void postMessage(String jsonStr) {
            if (jsonStr == null || jsonStr.trim().isEmpty()) return;
            try {
                JSONObject json = new JSONObject(jsonStr);
                JSObject jsObj = JSObject.fromJSONObject(json);
                notifyListeners("soeTecEvent", jsObj);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
