// API key custody. Keys live in the OS credential store (Windows Credential
// Manager / macOS Keychain / secret-service), never in the webview.
//
// There is deliberately NO command that returns a key to the frontend. The Ask and
// list-models paths read it here, in-process, so a malicious note or a compromised
// frontend dependency has nothing to exfiltrate — which is the whole point of the
// move off localStorage. `has_api_key` reports presence only.
use keyring::Entry;

/// Namespace for entries in the OS store; matches the bundle identifier so the
/// credentials are attributable to this app.
const SERVICE: &str = "com.aksha.hyperlinknotes";

fn entry(provider: &str) -> Result<Entry, String> {
    if provider.trim().is_empty() {
        return Err("No provider given.".into());
    }
    Entry::new(SERVICE, provider).map_err(|e| format!("Credential store unavailable: {e}"))
}

/// In-process read for the request paths. Never exposed as a command.
pub fn get_api_key(provider: &str) -> String {
    entry(provider)
        .ok()
        .and_then(|e| e.get_password().ok())
        .unwrap_or_default()
}

/// Store a key, or clear it when passed blank (mirrors "leave blank to disable AI").
#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<(), String> {
    let e = entry(&provider)?;
    if key.trim().is_empty() {
        // Deleting a credential that was never stored is not an error here.
        let _ = e.delete_credential();
        return Ok(());
    }
    e.set_password(&key)
        .map_err(|e| format!("Couldn't save the key to the credential store: {e}"))
}

#[tauri::command]
pub fn has_api_key(provider: String) -> bool {
    !get_api_key(&provider).is_empty()
}

#[tauri::command]
pub fn clear_api_key(provider: String) -> Result<(), String> {
    let e = entry(&provider)?;
    match e.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Couldn't remove the key: {e}")),
    }
}

/// One-shot migration for keys the old build left in localStorage. The frontend
/// hands over whatever it finds under `hln.llm.apiKey.*` on first run and then
/// clears them; anything already in the store wins so a migration can't clobber a
/// key the user has since re-entered.
#[tauri::command]
pub fn migrate_api_key(provider: String, key: String) -> Result<bool, String> {
    if key.trim().is_empty() || has_api_key(provider.clone()) {
        return Ok(false);
    }
    set_api_key(provider, key)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Touches the real OS credential store, so it's opt-in:
    //   cargo test -- --ignored
    // Uses a provider name no real provider uses, and cleans up after itself.
    const TEST_PROVIDER: &str = "__hln_test_provider__";

    #[test]
    #[ignore = "touches the OS credential store"]
    fn key_round_trips_through_the_credential_store() {
        let p = TEST_PROVIDER.to_string();
        let _ = clear_api_key(p.clone());
        assert!(!has_api_key(p.clone()), "should start absent");

        set_api_key(p.clone(), "sk-test-value".into()).expect("save");
        assert!(has_api_key(p.clone()), "should report present after save");
        assert_eq!(get_api_key(TEST_PROVIDER), "sk-test-value", "should read back in-process");

        // Blank clears, matching "leave blank to disable AI".
        set_api_key(p.clone(), "  ".into()).expect("blank clears");
        assert!(!has_api_key(p.clone()), "blank should clear");

        // Migration adopts only when nothing is stored.
        assert!(migrate_api_key(p.clone(), "from-localstorage".into()).expect("migrate"));
        assert_eq!(get_api_key(TEST_PROVIDER), "from-localstorage");
        assert!(
            !migrate_api_key(p.clone(), "should-not-win".into()).expect("second migrate"),
            "an existing stored key must win over a legacy one"
        );
        assert_eq!(get_api_key(TEST_PROVIDER), "from-localstorage");

        clear_api_key(p.clone()).expect("cleanup");
        assert!(!has_api_key(p), "cleanup should leave nothing behind");
    }
}
