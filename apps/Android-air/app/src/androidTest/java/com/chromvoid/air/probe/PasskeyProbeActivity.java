package com.chromvoid.air.probe;

import android.app.Activity;
import android.credentials.CreateCredentialException;
import android.credentials.CreateCredentialRequest;
import android.credentials.CreateCredentialResponse;
import android.credentials.CredentialManager;
import android.credentials.CredentialOption;
import android.credentials.GetCredentialException;
import android.credentials.GetCredentialRequest;
import android.credentials.GetCredentialResponse;
import android.os.Bundle;
import android.os.OutcomeReceiver;
import android.util.Base64;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A website's sign-in with passkeys, as another app asks Credential Manager for it: "Create
 * passkey" registers one for {@code example.com}, "Sign in" asks for an assertion. The page
 * shows the outcome and checks the assertion itself - its challenge in the client data and its
 * signature against the public key the registration returned - so a passing test proves the
 * credential works, not merely that something answered.
 *
 * <p>It speaks the framework's own API with the bundle keys Jetpack uses, and it is Java: it
 * runs in the test package's own process, which carries no Kotlin runtime.
 */
public final class PasskeyProbeActivity extends Activity {
    public static final String RP_ID = "example.com";
    public static final String USER = "alice@example.com";
    /** The website the probe stands for when it asks for a password, as a browser names it. */
    public static final String ORIGIN = "https://example.com";

    private static final String PASSWORD_TYPE = "android.credentials.TYPE_PASSWORD_CREDENTIAL";
    private static final String KEY_ALLOWED_USERS = "androidx.credentials.BUNDLE_KEY_ALLOWED_USER_IDS";
    private static final String KEY_PASSWORD_ID = "androidx.credentials.BUNDLE_KEY_ID";
    private static final String KEY_PASSWORD = "androidx.credentials.BUNDLE_KEY_PASSWORD";

    private static final String TYPE = "androidx.credentials.TYPE_PUBLIC_KEY_CREDENTIAL";
    private static final String KEY_SUBTYPE = "androidx.credentials.BUNDLE_KEY_SUBTYPE";
    private static final String KEY_REQUEST_JSON = "androidx.credentials.BUNDLE_KEY_REQUEST_JSON";
    private static final String KEY_PREFER_AVAILABLE =
            "androidx.credentials.BUNDLE_KEY_PREFER_IMMEDIATELY_AVAILABLE_CREDENTIALS";
    private static final String KEY_DISPLAY_INFO = "androidx.credentials.BUNDLE_KEY_REQUEST_DISPLAY_INFO";
    private static final String KEY_USER_ID = "androidx.credentials.BUNDLE_KEY_USER_ID";
    private static final String KEY_USER_DISPLAY_NAME = "androidx.credentials.BUNDLE_KEY_USER_DISPLAY_NAME";
    private static final String KEY_AUTO_SELECT = "androidx.credentials.BUNDLE_KEY_IS_AUTO_SELECT_ALLOWED";
    private static final String SUBTYPE_CREATE =
            "androidx.credentials.BUNDLE_VALUE_SUBTYPE_CREATE_PUBLIC_KEY_CREDENTIAL_REQUEST";
    private static final String SUBTYPE_GET =
            "androidx.credentials.BUNDLE_VALUE_SUBTYPE_GET_PUBLIC_KEY_CREDENTIAL_OPTION";
    private static final String KEY_REGISTRATION = "androidx.credentials.BUNDLE_KEY_REGISTRATION_RESPONSE_JSON";
    private static final String KEY_ASSERTION = "androidx.credentials.BUNDLE_KEY_AUTHENTICATION_RESPONSE_JSON";

    /** What the last registration returned: the credential and its public key, in memory only. */
    private static String credentialId;
    private static byte[] publicKey;

    private TextView state;
    private CredentialManager manager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ProbeWindow.untitled(this);
        manager = getSystemService(CredentialManager.class);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        state = new TextView(this);
        state.setText("ready");
        Button create = new Button(this);
        create.setText("Create passkey");
        create.setOnClickListener(view -> create());
        Button signIn = new Button(this);
        signIn.setText("Sign in with passkey");
        signIn.setOnClickListener(view -> signIn());
        Button password = new Button(this);
        password.setText("Sign in with password");
        password.setOnClickListener(view -> signInWithPassword());
        column.addView(state);
        column.addView(create);
        column.addView(signIn);
        column.addView(password);
        ProbeWindow.clearOfBars(column);
        setContentView(column);
    }

    private void create() {
        try {
            JSONObject options = new JSONObject()
                    .put("rp", new JSONObject().put("id", RP_ID).put("name", "Example"))
                    .put("user", new JSONObject()
                            .put("id", encode(USER.getBytes(StandardCharsets.UTF_8)))
                            .put("name", USER)
                            .put("displayName", "Alice"))
                    .put("challenge", encode(random()))
                    .put("pubKeyCredParams", new JSONArray().put(new JSONObject().put("type", "public-key").put("alg", -7)))
                    .put("timeout", 60000)
                    .put("attestation", "none")
                    .put("authenticatorSelection", new JSONObject()
                            .put("residentKey", "required")
                            .put("requireResidentKey", true)
                            .put("userVerification", "required"));
            Bundle data = request(SUBTYPE_CREATE, options.toString());
            Bundle display = new Bundle();
            display.putCharSequence(KEY_USER_ID, USER);
            display.putCharSequence(KEY_USER_DISPLAY_NAME, "Alice");
            data.putBundle(KEY_DISPLAY_INFO, display);
            CreateCredentialRequest request = new CreateCredentialRequest.Builder(
                    TYPE, data, request(SUBTYPE_CREATE, options.toString()))
                    .setAlwaysSendAppInfoToProvider(true)
                    .build();
            manager.createCredential(this, request, null, getMainExecutor(),
                    new OutcomeReceiver<CreateCredentialResponse, CreateCredentialException>() {
                        @Override
                        public void onResult(CreateCredentialResponse response) {
                            registered(response.getData().getString(KEY_REGISTRATION));
                        }

                        @Override
                        public void onError(CreateCredentialException error) {
                            state.setText("failed " + error.getType());
                        }
                    });
        } catch (Exception error) {
            state.setText("failed " + error);
        }
    }

    private void registered(String json) {
        try {
            JSONObject registration = new JSONObject(json);
            credentialId = registration.getString("id");
            publicKey = decode(registration.getJSONObject("response").getString("publicKey"));
            state.setText("created " + credentialId);
        } catch (Exception error) {
            state.setText("failed " + error);
        }
    }

    private void signIn() {
        try {
            byte[] challenge = random();
            JSONObject options = new JSONObject()
                    .put("challenge", encode(challenge))
                    .put("rpId", RP_ID)
                    .put("userVerification", "required")
                    .put("allowCredentials", new JSONArray())
                    .put("timeout", 60000);
            Bundle data = request(SUBTYPE_GET, options.toString());
            data.putBoolean(KEY_AUTO_SELECT, false);
            GetCredentialRequest request = new GetCredentialRequest.Builder(new Bundle())
                    .addCredentialOption(new CredentialOption.Builder(
                            TYPE, data, request(SUBTYPE_GET, options.toString())).build())
                    .setAlwaysSendAppInfoToProvider(true)
                    .build();
            manager.getCredential(this, request, null, getMainExecutor(),
                    new OutcomeReceiver<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse response) {
                            asserted(response.getCredential().getData().getString(KEY_ASSERTION), challenge);
                        }

                        @Override
                        public void onError(GetCredentialException error) {
                            state.setText("failed " + error.getType());
                        }
                    });
        } catch (Exception error) {
            state.setText("failed " + error);
        }
    }

    /**
     * A website's password sign-in, asked as a browser asks it: for the site's origin, which only
     * an app trusted as a browser may name. The account and password shown are synthetic.
     */
    private void signInWithPassword() {
        try {
            Bundle data = new Bundle();
            data.putStringArrayList(KEY_ALLOWED_USERS, new java.util.ArrayList<>());
            data.putBoolean(KEY_AUTO_SELECT, false);
            GetCredentialRequest request = new GetCredentialRequest.Builder(new Bundle())
                    .addCredentialOption(new CredentialOption.Builder(PASSWORD_TYPE, data, data).build())
                    .setOrigin(ORIGIN)
                    .setAlwaysSendAppInfoToProvider(true)
                    .build();
            manager.getCredential(this, request, null, getMainExecutor(),
                    new OutcomeReceiver<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse response) {
                            Bundle answer = response.getCredential().getData();
                            state.setText("password " + answer.getString(KEY_PASSWORD_ID)
                                    + " " + answer.getString(KEY_PASSWORD));
                        }

                        @Override
                        public void onError(GetCredentialException error) {
                            state.setText("failed " + error.getType());
                        }
                    });
        } catch (Exception error) {
            state.setText("failed " + error);
        }
    }

    /** Checks the assertion as a website would: the credential, the challenge, the signature. */
    private void asserted(String json, byte[] challenge) {
        try {
            JSONObject assertion = new JSONObject(json);
            JSONObject response = assertion.getJSONObject("response");
            String id = assertion.getString("id");
            byte[] clientData = decode(response.getString("clientDataJSON"));
            byte[] authenticatorData = decode(response.getString("authenticatorData"));
            JSONObject client = new JSONObject(new String(clientData, StandardCharsets.UTF_8));
            boolean sameChallenge = encode(challenge).equals(client.getString("challenge"));
            boolean signed = false;
            if (publicKey != null && id.equals(credentialId)) {
                PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(publicKey));
                Signature verifier = Signature.getInstance("SHA256withECDSA");
                verifier.initVerify(key);
                verifier.update(authenticatorData);
                verifier.update(MessageDigest.getInstance("SHA-256").digest(clientData));
                signed = verifier.verify(decode(response.getString("signature")));
            }
            state.setText("signed in " + id + (sameChallenge && signed ? " verified" : " unverified"));
        } catch (Exception error) {
            state.setText("failed " + error);
        }
    }

    private static Bundle request(String subtype, String json) {
        Bundle bundle = new Bundle();
        bundle.putString(KEY_SUBTYPE, subtype);
        bundle.putString(KEY_REQUEST_JSON, json);
        bundle.putBoolean(KEY_PREFER_AVAILABLE, false);
        return bundle;
    }

    private static byte[] random() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return bytes;
    }

    private static String encode(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static byte[] decode(String text) {
        return Base64.decode(text, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }
}
