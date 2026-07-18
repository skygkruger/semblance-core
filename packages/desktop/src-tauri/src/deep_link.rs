#[derive(Debug, PartialEq, Eq)]
pub(crate) enum DeepLinkAction {
    ActivateLicense(String),
    ImportReservation(String),
}

pub(crate) fn parse_deep_link(input: &str) -> Option<DeepLinkAction> {
    if input.contains('#') {
        return None;
    }
    let (route, query) = input.split_once('?')?;
    if query.contains('&') {
        return None;
    }
    let (name, encoded_value) = query.split_once('=')?;
    let value = percent_decode(encoded_value)?;
    if value.is_empty() {
        return None;
    }

    match (route, name) {
        ("semblance://activate", "key") if value.starts_with("sem_") => {
            Some(DeepLinkAction::ActivateLicense(value))
        }
        ("semblance://activate", "token") if !value.starts_with("sem_") => {
            Some(DeepLinkAction::ImportReservation(value))
        }
        ("semblance://reservation/import", "token") if !value.starts_with("sem_") => {
            Some(DeepLinkAction::ImportReservation(value))
        }
        _ => None,
    }
}

fn percent_decode(value: &str) -> Option<String> {
    let mut decoded = Vec::with_capacity(value.len());
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' => {
                let high = hex_value(*bytes.get(index + 1)?)?;
                let low = hex_value(*bytes.get(index + 2)?)?;
                decoded.push((high << 4) | low);
                index += 3;
            }
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(decoded).ok()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_deep_link, DeepLinkAction};

    #[test]
    fn exact_legacy_activate_token_routes_to_reservation_import() {
        assert_eq!(
            parse_deep_link("semblance://activate?key=sem_header.payload.signature"),
            Some(DeepLinkAction::ActivateLicense(
                "sem_header.payload.signature".into()
            ))
        );
        assert_eq!(
            parse_deep_link("semblance://activateevil?key=sem_valid"),
            None
        );
        assert_eq!(parse_deep_link("semblance://activate/?key=sem_valid"), None);
        assert_eq!(
            parse_deep_link("semblance://activate?token=legacy.jwt.value"),
            Some(DeepLinkAction::ImportReservation(
                "legacy.jwt.value".into()
            ))
        );
        assert_eq!(parse_deep_link("semblance://activate?token=sem_paid"), None);
    }

    #[test]
    fn reservation_import_never_routes_a_paid_key() {
        assert_eq!(
            parse_deep_link("semblance://reservation/import?token=legacy.jwt.value"),
            Some(DeepLinkAction::ImportReservation("legacy.jwt.value".into()))
        );
        assert_eq!(
            parse_deep_link("semblance://reservation/import?token=sem_paid"),
            None
        );
        assert_eq!(
            parse_deep_link("semblance://reservation/import?key=sem_paid"),
            None
        );
    }

    #[test]
    fn rejects_ambiguous_or_extended_urls() {
        for input in [
            "semblance://activate?key=sem_one&key=sem_two",
            "semblance://activate?key=sem_one&token=legacy",
            "semblance://reservation/import?token=legacy&extra=value",
            "semblance://reservation/import/",
            "semblance://reservation/import?token=",
            "https://activate?key=sem_valid",
            "semblance://activate?key=sem_valid#fragment",
        ] {
            assert_eq!(parse_deep_link(input), None, "{input}");
        }
    }
}
