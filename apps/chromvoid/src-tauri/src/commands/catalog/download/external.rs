use super::gallery::StagedCatalogFile;

pub(super) fn open_staged_file_with_system(
    path: &std::path::Path,
    mime_type: &str,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::mobile::open_file_with_system(path, Some(mime_type));
    }

    #[cfg(target_os = "ios")]
    {
        return crate::mobile::open_file_with_system(path, Some(mime_type));
    }

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        let _ = mime_type;
        return crate::helpers::open_path_with_system(path);
    }

    #[allow(unreachable_code)]
    {
        let _ = (path, mime_type);
        Err("Opening files externally is not supported on this platform".to_string())
    }
}

pub(super) fn share_staged_files_with_system(items: &[StagedCatalogFile]) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let native_items = items
            .iter()
            .map(|item| (item.path.as_path(), Some(item.mime_type.as_str())))
            .collect::<Vec<_>>();
        return crate::mobile::share_files_with_system(&native_items);
    }

    #[allow(unreachable_code)]
    {
        let _ = items;
        Err("Sharing files externally is not supported on this platform".to_string())
    }
}
