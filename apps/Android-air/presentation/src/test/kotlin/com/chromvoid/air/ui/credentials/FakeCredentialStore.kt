package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialWebsiteRule
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteResult
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteUpdateRequest
import com.chromvoid.air.bridge.wire.WebsiteRuleError
import com.chromvoid.air.bridge.wire.PassmanagerRootImportPreview
import com.chromvoid.air.ui.transfer.ImportSource
import com.chromvoid.air.ui.transfer.ReviewedImport
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.WireEnvelope
import com.chromvoid.air.bridge.wire.PassmanagerSSHEditRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHExportRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHExportResponse
import com.chromvoid.air.bridge.wire.PassmanagerSSHImportRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHKeyCreateResponse
import com.chromvoid.air.bridge.wire.PassmanagerSSHKeygenRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageResponse
import com.chromvoid.air.bridge.wire.SSHKeyMetadata
import com.chromvoid.air.bridge.wire.SSHKeySummary
import com.chromvoid.air.bridge.wire.CredentialDetail
import com.chromvoid.air.bridge.wire.CredentialSecurityAuditRow
import com.chromvoid.air.bridge.wire.PassmanagerOtpURIResponse
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordsResponse
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordSaveRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordRequest
import com.chromvoid.air.bridge.wire.OtpPreviewResponse
import com.chromvoid.air.bridge.wire.CredentialOtpSummary
import com.chromvoid.air.bridge.wire.CredentialSummary
import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntrySaveResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntryUpdateRequest
import com.chromvoid.air.bridge.wire.PassmanagerGroupPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerIconGetManyResponse
import com.chromvoid.air.bridge.wire.PassmanagerIconRecord
import com.chromvoid.air.bridge.wire.PassmanagerGroupSummary
import com.chromvoid.air.bridge.wire.PassmanagerPasswordGenerateRequest
import com.chromvoid.air.bridge.wire.PassmanagerSecurityAuditPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerSecurityAuditPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerTagPageResponse
import com.chromvoid.air.bridge.wire.PaymentCardMetadata

/**
 * A catalog that filters and pages the way Core does - by title, login or site,
 * in pages of the requested size - and records what it was asked. [failWith]
 * makes the next calls fail as Core or the bridge would.
 */
internal class FakeCredentialStore(entries: List<CredentialSummary> = emptyList()) : CredentialStore {
    val entries: MutableList<CredentialSummary> = entries.toMutableList()
    val pageRequests: MutableList<PassmanagerEntryPageRequest> = mutableListOf()
    var failWith: Exception? = null

    /** Replies about a different record than the one asked for. */
    var answerDetailFor: String? = null

    /** Protected fields by record id and secret type; a missing one reads as NODE_NOT_FOUND. */
    val secrets: MutableMap<Pair<String, String>, String> = mutableMapOf()
    val secretReads: MutableList<Pair<String, String>> = mutableListOf()
    val creates: MutableList<PassmanagerEntryCreateRequest> = mutableListOf()
    val updates: MutableList<PassmanagerEntryUpdateRequest> = mutableListOf()
    val secretWrites: MutableList<Triple<String, String, String>> = mutableListOf()
    val revisions: MutableMap<String, Int> = mutableMapOf()
    val cards: MutableMap<String, PaymentCardMetadata> = mutableMapOf()

    /** Tags by key, and the tag keys each record carries. */
    val tags: MutableMap<String, Pair<String, String>> = linkedMapOf()
    val entryTags: MutableMap<String, Set<String>> = mutableMapOf()

    /** Replaces every section key in a page, to model a reply outside the contract. */
    var sectionOverride: String? = null

    /** The audit rows Core would return, the revision it answers with and how many rows a page holds. */
    val auditRows: MutableList<CredentialSecurityAuditRow> = mutableListOf()
    var auditRevision: String = "a".repeat(64)
    var auditPageSize: Int = 50
    val auditRequests: MutableList<PassmanagerSecurityAuditPageRequest> = mutableListOf()

    /** One-time code settings by record, the revision of each record's list, and saved keys. */
    val otps: MutableMap<String, MutableList<CredentialOtpSummary>> = mutableMapOf()
    val otpRevisions: MutableMap<String, Int> = mutableMapOf()
    val otpSaves: MutableList<PassmanagerOtpRecordSaveRequest> = mutableListOf()
    var otpLeftSeconds: Long = 20
    /** Seconds left for the next codes asked for, in turn; after them [otpLeftSeconds]. */
    val otpLeftSecondsQueue: ArrayDeque<Long> = ArrayDeque()
    var otpCodeCalls: Int = 0

    /** Records whose delete Core refuses. */
    val refuseDeleteOf: MutableSet<String> = mutableSetOf()

    /** Group paths, without the root. */
    val groups: MutableSet<String> = sortedSetOf()
    val ensuredGroups: MutableList<String> = mutableListOf()

    /** Makes every group change fail as Core would for this code. */
    var failGroupChangesWith: String? = null

    /** Makes every secret write fail as Core would for this code. */
    var failSecretWritesWith: String? = null

    /** Answers a create for another record than the one asked. */
    var answerCreateWith: String? = null

    override suspend fun credentialPage(
        request: PassmanagerEntryPageRequest,
        generation: ULong,
    ): PassmanagerEntryPageResponse {
        pageRequests += request
        failWith?.let { throw it }
        val matching = entries.filter { it.matches(request.query) }
            .filter {
                val groupPath = request.groupPath
                groupPath == null || it.groupPath == groupPath ||
                    it.groupPath.startsWith(groupPath.trimEnd('/') + "/")
            }
            .filter { request.tagKey == null || request.tagKey in entryTags[it.id].orEmpty() }
            .filter { request.entryType == null || it.entryType == request.entryType }
            .filter {
                "otp" !in request.quickFilters.orEmpty() || it.hasCodes == true || otps[it.id].orEmpty().isNotEmpty()
            }
            .map { entry ->
                if (request.groupBy == "website") entry.copy(groupKey = entry.website.orEmpty()) else entry
            }
            .let { list -> sectionOverride?.let { key -> list.map { it.copy(groupKey = key) } } ?: list }
        val from = request.offset.toInt().coerceAtMost(matching.size)
        val to = (from + request.limit.toInt()).coerceAtMost(matching.size)
        return PassmanagerEntryPageResponse(
            entries = matching.subList(from, to),
            nextOffset = if (to < matching.size) to.toLong() else null,
            // Core counts the whole scope only for a sorted or grouped request.
            totalCount = if (request.sort != null || request.groupBy != null) matching.size.toLong() else null,
        )
    }

    override suspend fun credentialDetail(id: String, generation: ULong): CredentialDetail {
        failWith?.let { throw it }
        val entry = entries.firstOrNull { it.id == id } ?: throw CoreRefusal("NODE_NOT_FOUND", "detail")
        val keys = entryTags[id].orEmpty().toList()
        return detailOf(entry).copy(
            tagKeys = keys,
            tags = keys.map { tags.getValue(it).first },
            id = answerDetailFor ?: id,
            revision = revisions.getOrPut(id) { 1 }.toString(),
            paymentCard = cards[id],
        )
    }

    override suspend fun readCredentialSecret(id: String, type: String, generation: ULong): String {
        secretReads += id to type
        failWith?.let { throw it }
        return secrets[id to type] ?: throw CoreRefusal("NODE_NOT_FOUND", "passmanager:secret:read")
    }

    override suspend fun deleteCredential(id: String, generation: ULong) {
        failWith?.let { throw it }
        if (id in refuseDeleteOf) throw CoreRefusal("ACCESS_DENIED", "passmanager:entry:delete")
        if (entries.none { it.id == id }) throw CoreRefusal("NODE_NOT_FOUND", "passmanager:entry:delete")
        entries.removeAll { it.id == id }
        secrets.keys.removeAll { it.first == id }
    }

    override suspend fun otpRecords(id: String, generation: ULong): PassmanagerOtpRecordsResponse {
        failWith?.let { throw it }
        return PassmanagerOtpRecordsResponse(otps[id].orEmpty().toList(), otpRevisions.getOrPut(id) { 1 }.toString())
    }

    override suspend fun otpCode(request: PassmanagerOtpRecordRequest, generation: ULong): OtpPreviewResponse {
        failWith?.let { throw it }
        otps[request.entryID].orEmpty().firstOrNull { it.label == request.label }
            ?: throw CoreRefusal("NODE_NOT_FOUND", "passmanager:otp:record:code")
        otpCodeCalls += 1
        val left = otpLeftSecondsQueue.removeFirstOrNull() ?: otpLeftSeconds
        return OtpPreviewResponse(leftSeconds = left, otp = "123456", period = 30)
    }

    override suspend fun saveOtp(request: PassmanagerOtpRecordSaveRequest, generation: ULong) {
        failWith?.let { throw it }
        if (request.revision != otpRevisions.getOrPut(request.entryID) { 1 }.toString()) {
            throw CoreRefusal("SYNC_CONFLICT", "passmanager:otp:record:save")
        }
        otpSaves += request
        otps.getOrPut(request.entryID) { mutableListOf() } += request.settings
        otpRevisions[request.entryID] = otpRevisions.getValue(request.entryID) + 1
    }

    override suspend fun deleteOtp(request: PassmanagerOtpRecordRequest, generation: ULong) {
        failWith?.let { throw it }
        otps[request.entryID]?.removeAll { it.label == request.label }
        otpRevisions[request.entryID] = otpRevisions.getOrPut(request.entryID) { 1 } + 1
    }

    override suspend fun parseOtpUri(uri: String, generation: ULong): PassmanagerOtpURIResponse {
        failWith?.let { throw it }
        if (!uri.startsWith("otpauth://totp/")) throw CoreRefusal("INVALID_INPUT", "passmanager:otp:parseUri")
        val secret = uri.substringAfter("secret=").substringBefore('&')
        val issuer = uri.substringAfter("issuer=", "").substringBefore('&')
        val settings = CredentialOtpSummary(
            algorithm = "SHA1",
            digits = 6,
            encoding = "base32",
            label = issuer,
            otpType = "TOTP",
            period = 30,
        )
        return PassmanagerOtpURIResponse(account = "alice", issuer = issuer, secret = secret, settings = settings)
    }

    /** SSH keys by id; the page revision moves with every change. */
    val sshKeys: MutableMap<String, SSHKeyMetadata> = linkedMapOf()
    val sshPrivate: MutableMap<String, String> = mutableMapOf()
    var sshRevision: Int = 1
    val sshExports: MutableList<PassmanagerSSHExportRequest> = mutableListOf()

    private fun sshDigest(value: Any): String = value.hashCode().toUInt().toString(16).padStart(64, '0')

    private fun sshRow(key: SSHKeyMetadata): SSHKeySummary = SSHKeySummary(key = key, revision = sshDigest(key))

    override suspend fun sshPage(request: PassmanagerSSHPageRequest, generation: ULong): PassmanagerSSHPageResponse {
        failWith?.let { throw it }
        val matching = sshKeys.values.filter { key ->
            (request.keyType == null || key.type == request.keyType) &&
                (request.query.isNullOrEmpty() || key.name.orEmpty().contains(request.query!!, ignoreCase = true))
        }
        val page = matching.drop(request.offset.toInt()).take(request.limit.toInt())
        val next = (request.offset + page.size).takeIf { it < matching.size }
        return PassmanagerSSHPageResponse(
            keys = page.map(::sshRow),
            nextOffset = next,
            revision = sshDigest(sshRevision),
            totalCount = matching.size.toLong(),
        )
    }

    private fun addSsh(
        type: String,
        name: String?,
        comment: String?,
        private: String,
    ): PassmanagerSSHKeyCreateResponse {
        val id = "ssh-${sshKeys.size + 1}"
        sshKeys[id] = SSHKeyMetadata(comment = comment, fingerprint = "SHA256:$id", id = id, name = name, type = type)
        sshPrivate[id] = private
        sshRevision += 1
        return PassmanagerSSHKeyCreateResponse(
            fingerprint = "SHA256:$id",
            keyID = id,
            keyType = type,
            publicKeyOpenssh = "ssh-$type AAAA $id",
        )
    }

    override suspend fun generateSsh(
        request: PassmanagerSSHKeygenRequest,
        generation: ULong,
    ): PassmanagerSSHKeyCreateResponse {
        failWith?.let { throw it }
        return addSsh(request.keyType, request.name, request.comment, "PRIVATE ${request.keyType}")
    }

    override suspend fun importSsh(
        request: PassmanagerSSHImportRequest,
        generation: ULong,
    ): PassmanagerSSHKeyCreateResponse {
        failWith?.let { throw it }
        if (!request.privateKey.startsWith("-----BEGIN OPENSSH PRIVATE KEY-----")) {
            throw CoreRefusal("EMPTY_PAYLOAD", "passmanager:ssh:key:import")
        }
        return addSsh("ed25519", request.name, null, request.privateKey)
    }

    override suspend fun exportSsh(
        request: PassmanagerSSHExportRequest,
        generation: ULong,
    ): PassmanagerSSHExportResponse {
        failWith?.let { throw it }
        sshExports += request
        val key = sshKeys[request.keyID] ?: throw CoreRefusal("NODE_NOT_FOUND", "passmanager:ssh:key:export")
        return if (request.format == "openssh_public") {
            PassmanagerSSHExportResponse(content = "ssh-${key.type} AAAA ${key.id}", filename = "${key.id}.pub")
        } else {
            PassmanagerSSHExportResponse(content = sshPrivate.getValue(key.id), filename = key.id)
        }
    }

    override suspend fun editSsh(request: PassmanagerSSHEditRequest, generation: ULong): SSHKeySummary {
        failWith?.let { throw it }
        val key = sshKeys[request.keyID] ?: throw CoreRefusal("NODE_NOT_FOUND", "passmanager:ssh:key:edit")
        if (request.revision != sshDigest(key)) throw CoreRefusal("SYNC_CONFLICT", "passmanager:ssh:key:edit")
        val updated = key.copy(name = request.name, sourceEntryID = request.sourceEntryID)
        sshKeys[key.id] = updated
        sshRevision += 1
        return sshRow(updated)
    }

    override suspend fun deleteSsh(id: String, generation: ULong) {
        failWith?.let { throw it }
        sshKeys.remove(id) ?: throw CoreRefusal("NODE_NOT_FOUND", "passmanager:ssh:key:delete")
        sshPrivate.remove(id)
        sshRevision += 1
    }

    /** What each import file holds: its review, or the refusal Core gives it. */
    val importFiles: MutableMap<String, PassmanagerRootImportPreview> = mutableMapOf()
    val importPasswords: MutableMap<String, String> = mutableMapOf()
    var commitFailure: Exception? = null
    val commits: MutableList<Pair<String, Boolean>> = mutableListOf()
    var openReviews: Int = 0
    var exportDocument: ByteArray = "{\"entries\":[]}".toByteArray()
    var clears: Int = 0

    override suspend fun reviewCredentialFile(
        source: ImportSource,
        replacing: Boolean,
        sourcePassword: String?,
        generation: ULong,
    ): ReviewedImport {
        failWith?.let { throw it }
        source.open().close()
        importPasswords[source.name]?.let { expected ->
            when (sourcePassword) {
                null -> throw CoreRefusal("CREDENTIAL_IMPORT_PASSWORD_REQUIRED", "passmanager:root:import:review")
                expected -> Unit
                else -> throw CoreRefusal("CREDENTIAL_IMPORT_PASSWORD_INVALID", "passmanager:root:import:review")
            }
        }
        val preview = importFiles[source.name]
            ?: throw CoreRefusal("INVALID_INPUT", "passmanager:root:import:review")
        openReviews += 1
        return object : ReviewedImport {
            private var open = true
            override val preview = preview

            override suspend fun commit() {
                check(open) { "a spent review was committed" }
                commitFailure?.let { throw it }
                commits += source.name to replacing
                cancel()
            }

            override fun cancel() {
                if (open) openReviews -= 1
                open = false
            }
        }
    }

    override suspend fun exportCredentialDocument(generation: ULong): ByteArray {
        failWith?.let { throw it }
        return exportDocument.copyOf()
    }

    override suspend fun clearCredentials(generation: ULong) {
        failWith?.let { throw it }
        clears += 1
        entries.clear()
    }

    /** Website rules by record, and the revision each list is at. */
    val websiteRules: MutableMap<String, List<CredentialWebsiteRule>> = mutableMapOf()
    val websiteRevisions: MutableMap<String, Int> = mutableMapOf()

    private fun checkWebsites(rules: List<CredentialWebsiteRule>): List<WebsiteRuleError> =
        rules.mapIndexedNotNull { index, rule ->
            when {
                !rule.value.contains('.') -> WebsiteRuleError("invalid_url", index.toLong())
                rules.take(index).any { it.value == rule.value } -> WebsiteRuleError("duplicate", index.toLong())
                else -> null
            }
        }

    override suspend fun websiteRules(id: String, generation: ULong): PassmanagerWebsiteResult {
        failWith?.let { throw it }
        return PassmanagerWebsiteResult(
            errors = emptyList(),
            revision = websiteRevisions.getOrPut(id) { 1 }.toString(),
            rules = websiteRules[id].orEmpty(),
        )
    }

    override suspend fun validateWebsites(
        rules: List<CredentialWebsiteRule>,
        generation: ULong,
    ): PassmanagerWebsiteResult {
        failWith?.let { throw it }
        return PassmanagerWebsiteResult(errors = checkWebsites(rules), rules = rules)
    }

    override suspend fun updateWebsites(
        request: PassmanagerWebsiteUpdateRequest,
        generation: ULong,
    ): PassmanagerWebsiteResult {
        failWith?.let { throw it }
        val current = websiteRevisions.getOrPut(request.entryID) { 1 }
        if (request.revision != current.toString()) {
            throw CoreRefusal("SYNC_CONFLICT", "passmanager:entry:websites:update")
        }
        val errors = checkWebsites(request.rules)
        if (errors.isNotEmpty()) return PassmanagerWebsiteResult(errors = errors, rules = request.rules)
        websiteRules[request.entryID] = request.rules
        websiteRevisions[request.entryID] = current + 1
        val revision = (current + 1).toString()
        return PassmanagerWebsiteResult(errors = emptyList(), revision = revision, rules = request.rules)
    }

    override suspend fun createCredential(
        request: PassmanagerEntryCreateRequest,
        generation: ULong,
    ): PassmanagerEntrySaveResponse {
        creates += request
        failWith?.let { throw it }
        if (entries.any { it.title == request.title }) throw CoreRefusal("NAME_EXIST", "passmanager:entry:create")
        request.groupPath?.let(::savedGroup)
        entries += summary(request.entryID, request.title, request.username.orEmpty())
            .copy(entryType = request.entryType, groupPath = request.groupPath ?: "/")
        request.secrets.password?.let { secrets[request.entryID to "password"] = it }
        request.secrets.cardPan?.let { secrets[request.entryID to "card_pan"] = it }
        request.secrets.cardCvv?.let { secrets[request.entryID to "card_cvv"] = it }
        request.secrets.note?.let { secrets[request.entryID to "note"] = it }
        request.tagKeys?.let { entryTags[request.entryID] = it.toSet() }
        request.paymentCard?.let {
            cards[request.entryID] = WireEnvelope.json.decodeFromJsonElement(PaymentCardMetadata.serializer(), it)
        }
        return PassmanagerEntrySaveResponse(entryID = answerCreateWith ?: request.entryID)
    }

    override suspend fun updateCredential(
        request: PassmanagerEntryUpdateRequest,
        generation: ULong,
    ): PassmanagerEntrySaveResponse {
        updates += request
        failWith?.let { throw it }
        val current = revisions.getOrPut(request.entryID) { 1 }
        if (request.revision != current.toString()) throw CoreRefusal("SYNC_CONFLICT", "passmanager:entry:update")
        val index = entries.indexOfFirst { it.id == request.entryID }
        if (index < 0) throw CoreRefusal("NODE_NOT_FOUND", "passmanager:entry:update")
        val entry = entries[index]
        request.groupPath?.let(::savedGroup)
        entries[index] = entry.copy(
            title = request.title ?: entry.title,
            username = request.username ?: entry.username,
            groupPath = request.groupPath ?: entry.groupPath,
        )
        request.tagKeys?.let { entryTags[request.entryID] = it.toSet() }
        revisions[request.entryID] = current + 1
        return PassmanagerEntrySaveResponse(entryID = request.entryID)
    }

    override suspend fun saveCredentialSecret(id: String, type: String, value: String, generation: ULong) {
        failSecretWritesWith?.let { throw CoreRefusal(it, "passmanager:secret:save") }
        secretWrites += Triple(id, type, value)
        secrets[id to type] = value
    }

    /** The record transaction creates its missing destination, including parent groups. */
    private fun savedGroup(path: String) {
        var parent = ""
        for (name in path.split('/').filter { it.isNotEmpty() }) {
            parent += "/$name"
            groups += parent
        }
    }

    override suspend fun groupPage(parent: String, offset: Long, generation: ULong): PassmanagerGroupPageResponse {
        failWith?.let { throw it }
        val children = groups.filter { parentOf(it) == parent }.map { path ->
            PassmanagerGroupSummary(entryCount = entries.count { it.groupPath == path }.toLong(), path = path)
        }
        return PassmanagerGroupPageResponse(groups = children, parent = parent)
    }

    override suspend fun ensureGroup(path: String, generation: ULong) {
        ensuredGroups += path
        failGroupChangesWith?.let { throw CoreRefusal(it, "passmanager:group:ensure") }
        groups += path
    }

    override suspend fun renameGroup(path: String, name: String, generation: ULong) {
        failGroupChangesWith?.let { throw CoreRefusal(it, "passmanager:group:rename") }
        if (path !in groups) throw CoreRefusal("NODE_NOT_FOUND", "passmanager:group:rename")
        val renamed = parentOf(path).let { if (it == "/") "/$name" else "$it/$name" }
        if (renamed in groups) throw CoreRefusal("NAME_EXIST", "passmanager:group:rename")
        fun moved(value: String) =
            if (value == path || value.startsWith("$path/")) renamed + value.removePrefix(path) else value
        val all = groups.map(::moved)
        groups.clear()
        groups += all
        entries.replaceAll { it.copy(groupPath = moved(it.groupPath)) }
    }

    override suspend fun deleteGroup(path: String, generation: ULong) {
        failGroupChangesWith?.let { throw CoreRefusal(it, "passmanager:group:delete") }
        fun inside(value: String) = value == path || value.startsWith("$path/")
        groups.removeAll(::inside)
        entries.removeAll { inside(it.groupPath) }
    }

    override suspend fun tagPage(offset: Long, generation: ULong): PassmanagerTagPageResponse {
        failWith?.let { throw it }
        return PassmanagerTagPageResponse(tags = tags.map { (key, value) -> tagSummary(key, value) })
    }

    override suspend fun saveTag(
        sourceKey: String?,
        label: String,
        colorId: String,
        generation: ULong,
    ): CredentialTagSummary {
        failWith?.let { throw it }
        if (tags.any { (key, value) -> value.first == label && key != sourceKey }) {
            throw CoreRefusal("NAME_EXIST", "passmanager:tag:save")
        }
        val key = sourceKey ?: label.lowercase()
        tags[key] = label to colorId
        return tagSummary(key, tags.getValue(key))
    }

    override suspend fun deleteTag(key: String, generation: ULong) {
        failWith?.let { throw it }
        tags.remove(key)
        entryTags.replaceAll { _, keys -> keys - key }
    }

    override suspend fun securityAuditPage(
        request: PassmanagerSecurityAuditPageRequest,
        generation: ULong,
    ): PassmanagerSecurityAuditPageResponse {
        auditRequests += request
        failWith?.let { throw it }
        val matching = auditRows.filter { row ->
            when (request.issue) {
                null -> true
                "weak" -> row.audit?.weakPassword == true
                "reused" -> row.audit?.reusedPassword == true
                "without_otp" -> row.audit?.hasTwoFactor == false
                "failed" -> row.audit == null
                else -> false
            }
        }
        val from = request.offset.toInt().coerceAtMost(matching.size)
        val to = (from + auditPageSize).coerceAtMost(matching.size)
        return PassmanagerSecurityAuditPageResponse(
            algorithmVersion = 1,
            entries = matching.subList(from, to),
            failedCount = auditRows.count { it.audit == null }.toLong(),
            nextOffset = if (to < matching.size) to.toLong() else null,
            reusedPasswordCount = auditRows.count { it.audit?.reusedPassword == true }.toLong(),
            revision = auditRevision,
            totalCount = auditRows.size.toLong(),
            twoFactorCount = auditRows.count { it.audit?.hasTwoFactor == true }.toLong(),
            weakPasswordCount = auditRows.count { it.audit?.weakPassword == true }.toLong(),
        )
    }

    private fun tagSummary(key: String, value: Pair<String, String>) = CredentialTagSummary(
        colorID = value.second,
        count = entryTags.values.count { key in it }.toLong(),
        key = key,
        label = value.first,
    )

    private fun parentOf(path: String): String = path.substringBeforeLast('/').ifEmpty { "/" }

    /** Icons by digest, and every batch the cache asked for. */
    val icons: MutableMap<String, String> = mutableMapOf()
    val iconRequests: MutableList<List<String>> = mutableListOf()

    override suspend fun credentialIcons(iconRefs: List<String>, generation: ULong): PassmanagerIconGetManyResponse {
        iconRequests += iconRefs
        failWith?.let { throw it }
        val found = iconRefs.filter { it in icons }
        return PassmanagerIconGetManyResponse(
            icons = found.map {
                PassmanagerIconRecord(
                    backgroundColor = "#102030",
                    contentBase64 = icons.getValue(it),
                    iconRef = it,
                    mimeType = "image/png",
                )
            },
            missingIconRefs = iconRefs - found.toSet(),
        )
    }

    /** How many times Core was asked for a password; a refused draft must not ask at all. */
    var generatedPasswords: Int = 0
        private set

    override suspend fun generatePassword(request: PassmanagerPasswordGenerateRequest, generation: ULong): String {
        failWith?.let { throw it }
        generatedPasswords += 1
        return "generated-" + request.length
    }

    private fun CredentialSummary.matches(query: String): Boolean =
        query.isBlank() || listOfNotNull(title, username, website).any { it.contains(query.trim(), ignoreCase = true) }

    companion object {
        fun summary(id: String, title: String, username: String = "", website: String? = null): CredentialSummary =
            CredentialSummary(
                entryType = "login",
                groupPath = "/",
                id = id,
                title = title,
                username = username,
                website = website,
            )

        fun detailOf(entry: CredentialSummary): CredentialDetail = CredentialDetail(
            entryType = entry.entryType,
            groupPath = entry.groupPath,
            id = entry.id,
            revision = "1",
            tagKeys = emptyList(),
            tags = emptyList(),
            title = entry.title,
            username = entry.username,
            websites = listOfNotNull(entry.website),
            websitesEditable = true,
        )

        fun many(count: Int): List<CredentialSummary> = (1..count).map { summary("id-$it", "Record $it") }
    }
}
