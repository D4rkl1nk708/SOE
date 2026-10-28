package com.soe.estudos;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Abre o dialogo nativo de impressao do Android para o WebView.
 * O usuario pode escolher "Salvar como PDF"; o CSS @media print ja
 * isola apenas o caderno de provas/gabarito.
 */
@CapacitorPlugin(name = "ExamPdf")
public class ExamPdfPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                String jobName = call.getString("jobName", "SOE - Simulado");
                PrintManager printManager =
                        (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter =
                        getBridge().getWebView().createPrintDocumentAdapter(jobName);
                printManager.print(
                        jobName,
                        adapter,
                        new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .build()
                );
                JSObject result = new JSObject();
                result.put("opened", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Falha ao abrir a impressao: " + error.getMessage(), error);
            }
        });
    }
}
