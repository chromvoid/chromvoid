package com.chromvoid.air.probe;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * A sign-in page at {@code https://example.com/login}, in a WebView, answered by this activity
 * itself: the navigation is real, so the autofill framework reports its web domain - how
 * ChromVoid matches logins - and nothing reaches a network, as every other request is refused.
 * The page shows what was filled: the account and only the password's length. Signing in
 * submits the form for real, to a welcome page this activity answers too - a submission is
 * what makes the system offer to save what was typed.
 *
 * <p>It is Java: it runs in the test package's own process, which carries no Kotlin runtime.
 */
public final class AutofillProbeActivity extends Activity {
    public static final String ORIGIN = "https://example.com/login";
    public static final String WELCOME = "https://example.com/welcome";

    private static final String PAGE =
            "<!doctype html>\n" +
            "<html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Sign in</title></head>\n" +
            "<body>\n" +
            "<form id=\"login\" method=\"get\" action=\"" + WELCOME + "\">\n" +
            "  <p><label for=\"username\">Email</label><br>\n" +
            "    <input id=\"username\" name=\"username\" type=\"email\" autocomplete=\"username\"></p>\n" +
            "  <p><label for=\"password\">Password</label><br>\n" +
            "    <input id=\"password\" name=\"password\" type=\"password\" autocomplete=\"current-password\"></p>\n" +
            "  <p><button type=\"submit\">Sign in</button></p>\n" +
            "</form>\n" +
            "<p id=\"state\">nothing filled</p>\n" +
            "<script>\n" +
            "  function show() {\n" +
            "    var user = document.getElementById('username').value;\n" +
            "    var secret = document.getElementById('password').value;\n" +
            "    var text = user || secret ? 'filled ' + user + ' ' + secret.length : 'nothing filled';\n" +
            "    var state = document.getElementById('state');\n" +
            "    if (state.textContent !== text) state.textContent = text;\n" +
            "  }\n" +
            "  setInterval(show, 250);\n" +
            "</script>\n" +
            "</body></html>\n" +
            "\n";

    private static final String SIGNED_IN =
            "<!doctype html><html><head><title>Welcome</title></head><body><p>signed in</p></body></html>\n";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ProbeWindow.untitled(this);
        WebView page = new WebView(this);
        page.getSettings().setJavaScriptEnabled(true);
        page.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (ORIGIN.equals(request.getUrl().toString())) {
                    return new WebResourceResponse("text/html", "utf-8", stream(PAGE));
                }
                if (request.getUrl().toString().startsWith(WELCOME)) {
                    return new WebResourceResponse("text/html", "utf-8", stream(SIGNED_IN));
                }
                return new WebResourceResponse(
                    "text/plain", "utf-8", 404, "Not Found", Collections.emptyMap(), stream(""));
            }
        });
        ProbeWindow.clearOfBars(page);
        setContentView(page);
        page.loadUrl(ORIGIN);
    }

    private static ByteArrayInputStream stream(String text) {
        return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
    }
}
