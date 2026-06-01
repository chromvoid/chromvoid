use std::time::Duration;

const UPLOAD_PERF_SLOW_CALL: Duration = Duration::from_millis(50);

#[derive(Default)]
pub(super) struct UploadPerfTotals {
    pub(super) parts: u64,
    pub(super) partial_parts: u64,
    pub(super) bytes_written: u64,
    pub(super) existing_read_elapsed: Duration,
    pub(super) decrypt_elapsed: Duration,
    pub(super) merge_copy_elapsed: Duration,
    pub(super) encrypt_elapsed: Duration,
    pub(super) write_elapsed: Duration,
    pub(super) sync_elapsed: Duration,
    pub(super) final_update_elapsed: Duration,
    pub(super) slowest_part_elapsed: Duration,
    pub(super) slowest_encrypt_elapsed: Duration,
    pub(super) slowest_write_elapsed: Duration,
}

pub(super) fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

pub(super) fn log_upload_perf(
    total_elapsed: Duration,
    stream_read_elapsed: Duration,
    perf: &UploadPerfTotals,
    node_id: u64,
    offset: u64,
    request_size: u64,
    uploaded_bytes: u64,
    is_final: bool,
    declared_size: Option<u64>,
) {
    if total_elapsed < UPLOAD_PERF_SLOW_CALL {
        return;
    }
    tracing::info!(
        "catalog_upload_perf: done node_id={} offset={} request_size={} declared_size={:?} uploaded_bytes={} is_final={} parts={} partial_parts={} bytes_written={} total_ms={:.2} stream_read_ms={:.2} existing_read_ms={:.2} decrypt_ms={:.2} merge_copy_ms={:.2} encrypt_ms={:.2} write_ms={:.2} sync_ms={:.2} final_update_ms={:.2} slowest_part_ms={:.2} slowest_encrypt_ms={:.2} slowest_write_ms={:.2}",
        node_id,
        offset,
        request_size,
        declared_size,
        uploaded_bytes,
        is_final,
        perf.parts,
        perf.partial_parts,
        perf.bytes_written,
        duration_ms(total_elapsed),
        duration_ms(stream_read_elapsed),
        duration_ms(perf.existing_read_elapsed),
        duration_ms(perf.decrypt_elapsed),
        duration_ms(perf.merge_copy_elapsed),
        duration_ms(perf.encrypt_elapsed),
        duration_ms(perf.write_elapsed),
        duration_ms(perf.sync_elapsed),
        duration_ms(perf.final_update_elapsed),
        duration_ms(perf.slowest_part_elapsed),
        duration_ms(perf.slowest_encrypt_elapsed),
        duration_ms(perf.slowest_write_elapsed),
    );
}
