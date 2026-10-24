package com.chromvoid.app.nativebridge

import org.json.JSONArray
import org.json.JSONObject

internal object NativeUploadPayloadCodec {
    fun encodeFiles(files: List<PickedFile>): String {
        val payload = JSONArray()
        files.forEach { file ->
            payload.put(
                JSONObject()
                    .put("fileId", file.fileId)
                    .put("name", file.name)
                    .put("size", file.size)
                    .put("mimeType", file.mimeType),
            )
        }
        return payload.toString()
    }

    fun encodeUploadReadProvenance(provenance: UploadReadProvenance): String =
        JSONObject()
            .put("imageCandidate", provenance.imageCandidate)
            .put("permissionStatus", provenance.permissionStatus)
            .put("requireOriginalStatus", provenance.requireOriginalStatus)
            .put("originalStreamUsed", provenance.originalStreamUsed)
            .put("regularStreamFallback", provenance.regularStreamFallback)
            .put("uriScheme", provenance.uriScheme)
            .put("uriAuthority", provenance.uriAuthority)
            .put("capturedAtMs", provenance.capturedAtMs)
            .toString()
}
