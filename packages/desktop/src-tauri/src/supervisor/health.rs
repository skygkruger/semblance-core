use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KernelReadinessSnapshot {
    pub protocol_version: u8,
    pub build_hash: String,
    pub policy_epoch: u64,
    pub device_id: String,
    pub registered_process_types: Vec<String>,
}

pub async fn query_kernel_readiness(socket_path: &str) -> Result<KernelReadinessSnapshot, String> {
    let request = serde_json::json!({
        "id": 1,
        "method": "kernel.readiness",
        "params": {}
    });
    let request_bytes = encode_length_prefixed_json(&request)?;

    #[cfg(unix)]
    {
        use tokio::net::UnixStream;
        let mut stream = UnixStream::connect(socket_path)
            .await
            .map_err(|e| format!("Failed to connect to kernel socket {}: {}", socket_path, e))?;
        stream
            .write_all(&request_bytes)
            .await
            .map_err(|e| format!("Failed to write kernel readiness request: {}", e))?;
        let response_bytes = read_length_prefixed_json(&mut stream).await?;
        return parse_readiness_response(&response_bytes);
    }

    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ClientOptions;
        let mut client = ClientOptions::new()
            .open(socket_path)
            .map_err(|e| format!("Failed to open kernel named pipe {}: {}", socket_path, e))?;
        client
            .write_all(&request_bytes)
            .await
            .map_err(|e| format!("Failed to write kernel readiness request: {}", e))?;
        let response_bytes = read_length_prefixed_json(&mut client).await?;
        return parse_readiness_response(&response_bytes);
    }
}

fn encode_length_prefixed_json(value: &Value) -> Result<Vec<u8>, String> {
    let payload = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    if payload.len() > 10_000_000 {
        return Err("Kernel RPC payload too large".to_string());
    }
    let mut message = Vec::with_capacity(4 + payload.len());
    message.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    message.extend_from_slice(&payload);
    Ok(message)
}

async fn read_length_prefixed_json<S>(stream: &mut S) -> Result<Vec<u8>, String>
where
    S: AsyncReadExt + Unpin,
{
    let mut header = [0_u8; 4];
    stream
        .read_exact(&mut header)
        .await
        .map_err(|e| format!("Failed to read kernel RPC header: {}", e))?;
    let length = u32::from_be_bytes(header) as usize;
    if length > 10_000_000 {
        return Err("Kernel RPC response too large".to_string());
    }

    let mut payload = vec![0_u8; length];
    stream
        .read_exact(&mut payload)
        .await
        .map_err(|e| format!("Failed to read kernel RPC payload: {}", e))?;
    Ok(payload)
}

fn parse_readiness_response(payload: &[u8]) -> Result<KernelReadinessSnapshot, String> {
    let value: Value =
        serde_json::from_slice(payload).map_err(|e| format!("Invalid kernel RPC JSON: {}", e))?;

    if let Some(error) = value.get("error") {
        return Err(format!("Kernel RPC error: {}", error));
    }

    let result = value
        .get("result")
        .ok_or_else(|| "Kernel RPC response missing result".to_string())?;

    serde_json::from_value(result.clone())
        .map_err(|e| format!("Invalid kernel readiness payload: {}", e))
}

#[cfg(test)]
mod tests {
    use super::parse_readiness_response;

    #[test]
    fn parse_readiness_response_extracts_result() {
        let payload = br#"{"id":1,"result":{"protocolVersion":1,"buildHash":"sha256:test","policyEpoch":2,"deviceId":"dev-1","registeredProcessTypes":["host","kernel"]}}"#;
        let snapshot = parse_readiness_response(payload).expect("readiness");
        assert_eq!(snapshot.protocol_version, 1);
        assert_eq!(snapshot.build_hash, "sha256:test");
        assert_eq!(snapshot.policy_epoch, 2);
        assert_eq!(snapshot.device_id, "dev-1");
        assert!(snapshot.registered_process_types.contains(&"kernel".to_string()));
    }
}
