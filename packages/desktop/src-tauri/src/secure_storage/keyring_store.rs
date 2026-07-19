use keyring::Entry;

fn entry(service: &str, key: &str) -> Result<Entry, String> {
    Entry::new(service, key).map_err(|err| format!("keyring entry error: {err}"))
}

pub fn get_secret(service: &str, key: &str) -> Result<Option<String>, String> {
    match entry(service, key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("secure storage read failed: {err}")),
    }
}

pub fn set_secret(service: &str, key: &str, value: &str) -> Result<(), String> {
    entry(service, key)?
        .set_password(value)
        .map_err(|err| format!("secure storage write failed: {err}"))
}

pub fn delete_secret(service: &str, key: &str) -> Result<(), String> {
    match entry(service, key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(format!("secure storage delete failed: {err}")),
    }
}
