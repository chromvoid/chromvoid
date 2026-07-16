// Xcode builds this tiny container only to obtain the host provisioning
// profile and validate the embedded Credential Provider. The shipped desktop
// app is the Tauri bundle with the same identifier and entitlements.
int main(void) {
    return 0;
}
