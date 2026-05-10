use serde::de::DeserializeOwned;

pub struct Parsed<T> {
    pub front: T,
    pub body: String,
}

pub fn split(src: &str) -> Option<(String, String)> {
    let trimmed = src.trim_start_matches('\u{FEFF}');
    if !trimmed.starts_with("---") {
        return None;
    }
    let after = &trimmed[3..];
    let after = after.strip_prefix('\n').unwrap_or(after);
    let end = after.find("\n---")?;
    let yaml = &after[..end];
    let rest = &after[end + 4..];
    let body = rest.strip_prefix('\n').unwrap_or(rest);
    Some((yaml.to_string(), body.to_string()))
}

pub fn parse<T: DeserializeOwned>(src: &str) -> Option<Parsed<T>> {
    let (yaml, body) = split(src)?;
    let front: T = serde_yaml::from_str(&yaml).ok()?;
    Some(Parsed { front, body })
}
