package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntrySaveResponse
import com.chromvoid.air.bridge.wire.PassmanagerGroupPageResponse
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.CredentialFormModel.FieldError
import com.chromvoid.air.ui.credentials.CredentialFormModel.Issue
import com.chromvoid.air.ui.credentials.CredentialFormModel.Kind
import com.chromvoid.air.ui.credentials.CredentialFormModel.Status
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class CredentialFormModelTest {
    private val store = FakeCredentialStore()
    private val saved = mutableListOf<String>()

    private fun TestScope.newForm(kind: Kind, source: CredentialStore = store): CredentialFormModel =
        CredentialFormModel.create(kind, source, generation = 1uL, scope = modelScope(), cards = FakeCardRules) {
            saved += it
        }

    private suspend fun TestScope.editForm(id: String, source: CredentialStore = store): CredentialFormModel {
        val detail = store.credentialDetail(id, generation = 1uL)
        return checkNotNull(
            CredentialFormModel.edit(detail, source, generation = 1uL, scope = modelScope(), cards = FakeCardRules) {
                saved += it
            },
        ).also { advanceUntilIdle() }
    }

    @Test
    public fun `an empty title is a form problem and never reaches Core`(): Unit = runTest {
        val form = newForm(Kind.LOGIN)

        form.save()
        advanceUntilIdle()

        assertEquals(mapOf(Field.TITLE to FieldError.REQUIRED), form.state.value.errors)
        assertEquals(Field.TITLE, form.state.value.focus)
        assertTrue(store.creates.isEmpty())
    }

    @Test
    public fun `a new login is created once with its protected fields`(): Unit = runTest {
        val form = newForm(Kind.LOGIN)
        form.change(Field.TITLE, "Mail")
        form.change(Field.USERNAME, "alice")
        form.change(Field.PASSWORD, "hunter2")

        form.save()
        form.save()
        advanceUntilIdle()

        assertEquals("a second tap while saving is refused", 1, store.creates.size)
        val id = store.creates.single().entryID
        assertEquals(listOf(id), saved)
        assertEquals("hunter2", store.secrets[id to "password"])
        assertEquals(Status.SAVED, form.state.value.status)
    }

    @Test
    public fun `a taken title points at the title and keeps the draft`(): Unit = runTest {
        store.entries += summary("mail", "Mail")
        val form = newForm(Kind.LOGIN)
        form.change(Field.TITLE, "Mail")
        form.change(Field.PASSWORD, "hunter2")

        form.save()
        advanceUntilIdle()

        assertEquals(FieldError.NAME_TAKEN, form.state.value.errors[Field.TITLE])
        assertEquals(Status.EDITING, form.state.value.status)
        assertEquals("hunter2", form.state.value.value(Field.PASSWORD))
        assertTrue(saved.isEmpty())
    }

    @Test
    public fun `a card needs a readable expiry and keeps its network`(): Unit = runTest {
        val form = newForm(Kind.CARD)
        form.change(Field.TITLE, "Visa")
        form.change(Field.CARDHOLDER, "ALICE")
        form.change(Field.CARD_NUMBER, "4111111111111111")
        form.change(Field.MONTH, "13")
        form.change(Field.YEAR, "35")

        form.save()
        advanceUntilIdle()
        assertEquals(FieldError.MONTH, form.state.value.errors[Field.MONTH])
        assertTrue(store.creates.isEmpty())

        form.change(Field.MONTH, "3")
        form.save()
        advanceUntilIdle()

        val card = store.cards.getValue(store.creates.single().entryID)
        assertEquals("visa", card.brand)
        assertEquals(3L, card.expMonth)
        assertEquals(2035L, card.expYear)
        assertEquals("4111111111111111", store.secrets[store.creates.single().entryID to "card_pan"])
    }

    @Test
    public fun `the card keeps what it can print and hands focus on as each field fills`(): Unit = runTest {
        val form = newForm(Kind.CARD)

        form.change(Field.CARD_NUMBER, "4111-1111 1111 111a")
        assertEquals("separators and letters are dropped", "411111111111111", form.state.value.value(Field.CARD_NUMBER))
        assertEquals("visa", form.state.value.cardFormat?.network)
        assertNull("fifteen Visa digits are not yet whole", form.state.value.focus)

        form.change(Field.CARD_NUMBER, "4111111111111111")
        assertEquals("a whole number moves on to the expiry", Field.MONTH, form.state.value.focus)

        form.change(Field.MONTH, "5")
        assertEquals("a month from 2 to 9 is written as the card writes it", "05", form.state.value.value(Field.MONTH))
        assertEquals(Field.YEAR, form.state.value.focus)

        form.change(Field.YEAR, "20")
        assertEquals("`20` may begin a four-digit year", Field.YEAR, form.state.value.focus)
        form.change(Field.YEAR, "2035")
        assertEquals(Field.CARD_CODE, form.state.value.focus)

        form.change(Field.CARD_CODE, "1234")
        assertEquals("a Visa code has three digits", "123", form.state.value.value(Field.CARD_CODE))
        assertEquals("the empty holder is next", Field.CARDHOLDER, form.state.value.focus)
    }

    @Test
    public fun `a filled card ends the typing and a shorter edit never jumps`(): Unit = runTest {
        val form = newForm(Kind.CARD)
        form.change(Field.CARDHOLDER, "ALICE")
        form.change(Field.CARD_NUMBER, "378282246310005")
        assertEquals("an American Express number is whole at fifteen", Field.MONTH, form.state.value.focus)
        val request = form.state.value.focusRequest

        form.change(Field.MONTH, "1")
        assertEquals("`1` may begin 10 to 12", request, form.state.value.focusRequest)
        form.change(Field.MONTH, "12")
        form.change(Field.YEAR, "35")
        form.change(Field.CARD_CODE, "1234")

        assertEquals("an American Express code has four digits", "1234", form.state.value.value(Field.CARD_CODE))
        assertNull("the holder is filled: the keyboard goes", form.state.value.focus)
        val filled = form.state.value.focusRequest
        form.change(Field.CARD_CODE, "123")
        assertEquals("deleting never moves focus", filled, form.state.value.focusRequest)
    }

    @Test
    public fun `a card needs no name and the form shows the one Core will give it`(): Unit = runTest {
        val form = newForm(Kind.CARD)
        assertNull("no number, no name to suggest", form.state.value.cardTitleHint)
        form.change(Field.CARDHOLDER, "ALICE")
        form.change(Field.CARD_NUMBER, "4111111111111111")
        form.change(Field.MONTH, "03")
        form.change(Field.YEAR, "35")
        assertEquals("Visa •••• 1111", form.state.value.cardTitleHint)

        form.save()
        advanceUntilIdle()

        assertTrue(form.state.value.errors.isEmpty())
        assertEquals("a blank name leaves the naming to Core", "", store.creates.single().title)
    }

    @Test
    public fun `a short number is refused before Core and a doubtful one only warns`(): Unit = runTest {
        val form = newForm(Kind.CARD)
        form.change(Field.TITLE, "Card")
        form.change(Field.CARDHOLDER, "ALICE")
        form.change(Field.MONTH, "03")
        form.change(Field.YEAR, "35")
        form.change(Field.CARD_NUMBER, "41111111111")

        form.save()
        advanceUntilIdle()
        assertEquals(FieldError.CARD_NUMBER, form.state.value.errors[Field.CARD_NUMBER])
        assertEquals(Field.CARD_NUMBER, form.state.value.focus)
        assertTrue(store.creates.isEmpty())

        form.numberFocusChanged(true)
        form.change(Field.CARD_NUMBER, "4111111111111112")
        assertFalse("no doubt while the number is typed", form.state.value.numberWarning)
        form.numberFocusChanged(false)
        assertTrue("the check digit fails once the field is left", form.state.value.numberWarning)

        form.save()
        advanceUntilIdle()
        assertEquals("the doubt does not stop the save", 1, store.creates.size)
    }

    @Test
    public fun `an edit sends only what changed, under the revision it opened with`(): Unit = runTest {
        store.entries += summary("mail", "Mail", "alice")
        store.secrets["mail" to "password"] = "hunter2"
        val form = editForm("mail")
        assertEquals("hunter2", form.state.value.value(Field.PASSWORD))
        assertFalse(form.state.value.isDirty)

        form.change(Field.TITLE, "Work mail")
        form.change(Field.PASSWORD, "correct horse")
        form.save()
        advanceUntilIdle()

        val update = store.updates.single()
        assertEquals("Work mail", update.title)
        assertNull("an unchanged login is not sent", update.username)
        assertEquals("1", update.revision)
        assertEquals(listOf(Triple("mail", "password", "correct horse")), store.secretWrites)
        assertEquals(listOf("mail"), saved)
    }

    @Test
    public fun `a save that half landed asks for a fresh start instead of retrying`(): Unit = runTest {
        store.entries += summary("mail", "Mail")
        store.secrets["mail" to "password"] = "hunter2"
        val form = editForm("mail")
        store.failSecretWritesWith = "INTERNAL"

        form.change(Field.TITLE, "Work mail")
        form.change(Field.PASSWORD, "correct horse")
        form.save()
        advanceUntilIdle()

        assertEquals(Status.NEEDS_RELOAD, form.state.value.status)
        assertEquals(Issue.PARTIAL, form.state.value.issue)
        assertTrue(saved.isEmpty())
    }

    @Test
    public fun `a record changed elsewhere is not overwritten`(): Unit = runTest {
        store.entries += summary("mail", "Mail")
        val form = editForm("mail")
        store.revisions["mail"] = 2

        form.change(Field.TITLE, "Work mail")
        form.save()
        advanceUntilIdle()

        assertEquals(Issue.STALE, form.state.value.issue)
        assertEquals("Mail", store.entries.single().title)
    }

    @Test
    public fun `a vault that allows no changes explains it and keeps the draft`(): Unit = runTest {
        store.failWith = CoreRefusal("ACCESS_DENIED", "passmanager:entry:create")
        val form = newForm(Kind.LOGIN)
        form.change(Field.TITLE, "Mail")

        form.save()
        advanceUntilIdle()

        assertEquals(Issue.DENIED, form.state.value.issue)
        assertEquals(Status.EDITING, form.state.value.status)
        assertEquals("Mail", form.state.value.value(Field.TITLE))
    }

    @Test
    public fun `Core answering for another record is not taken as success`(): Unit = runTest {
        store.answerCreateWith = "someone-else"
        val form = newForm(Kind.LOGIN)
        form.change(Field.TITLE, "Mail")

        form.save()
        advanceUntilIdle()

        assertEquals(Issue.UNCERTAIN, form.state.value.issue)
        assertTrue(saved.isEmpty())
    }

    @Test
    public fun `a changed draft asks before it is discarded, an untouched one does not`(): Unit = runTest {
        val untouched = newForm(Kind.LOGIN)
        assertTrue(untouched.requestDismiss())

        val changed = newForm(Kind.LOGIN)
        changed.change(Field.TITLE, "Mail")
        assertFalse(changed.requestDismiss())
        assertTrue(changed.state.value.confirmingDiscard)
        changed.cancelDiscard()
        assertEquals("Mail", changed.state.value.value(Field.TITLE))
    }

    @Test
    public fun `tags go with a new record and with an edit only when they changed`(): Unit = runTest {
        store.tags["work"] = "Work" to "blue"
        store.tags["home"] = "Home" to "green"
        val work = CredentialTagSummary(colorID = "blue", count = 0, key = "work", label = "Work")
        val home = CredentialTagSummary(colorID = "green", count = 0, key = "home", label = "Home")
        val form = newForm(Kind.LOGIN)
        form.change(Field.TITLE, "Mail")
        form.setTags(listOf(work))
        form.save()
        advanceUntilIdle()
        val id = store.creates.single().entryID
        assertEquals(listOf("work"), store.creates.single().tagKeys)

        val edit = editForm(id)
        assertEquals(listOf("work"), edit.state.value.tags.map { it.key })
        edit.change(Field.USERNAME, "alice")
        edit.save()
        advanceUntilIdle()
        assertNull("unchanged tags are not sent", store.updates.last().tagKeys)

        val again = editForm(id)
        again.setTags(listOf(work, home))
        again.save()
        advanceUntilIdle()
        assertEquals(listOf("work", "home"), store.updates.last().tagKeys)
    }

    @Test
    public fun `choosing a new group keeps the login draft and creates the group only with Save`(): Unit = runTest {
        store.groups += "/Personal"
        val checked = mutableListOf<String>()
        val reader = object : CredentialStore by store {
            override suspend fun groupPage(
                parent: String,
                offset: Long,
                generation: ULong,
            ): PassmanagerGroupPageResponse {
                checked += parent
                throw CoreRefusal("NODE_NOT_FOUND", "passmanager:group:page")
            }
        }
        val form = newForm(Kind.LOGIN, reader)
        form.change(Field.TITLE, "Mail")
        form.change(Field.PASSWORD, "hunter2")
        val picker = GroupPickerModel("/", store, 1uL, modelScope())
        picker.open("/Personal")
        advanceUntilIdle()
        picker.beginNewGroup()
        checkNotNull(picker.newGroup.value).input.setTextAndPlaceCursorAtEnd("Travel")

        form.setGroup(checkNotNull(picker.chooseNewGroup()))
        picker.close()
        advanceUntilIdle()

        assertEquals("/Personal/Travel", form.state.value.group)
        assertEquals("Mail", form.state.value.value(Field.TITLE))
        assertEquals("hunter2", form.state.value.value(Field.PASSWORD))
        assertEquals(setOf("/Personal"), store.groups)
        assertTrue(store.creates.isEmpty())
        assertTrue(store.ensuredGroups.isEmpty())
        assertTrue("choosing a group does not begin Save's check", checked.isEmpty())

        form.save()
        advanceUntilIdle()

        val request = store.creates.single()
        assertEquals("/Personal/Travel", request.groupPath)
        assertEquals("hunter2", request.secrets.password)
        assertTrue("/Personal/Travel" in store.groups)
        assertEquals(listOf(request.entryID), saved)
        assertEquals(listOf("/Personal/Travel"), checked)
        assertTrue("Core's record transaction owns missing groups", store.ensuredGroups.isEmpty())
    }

    @Test
    public fun `an edited record creates its new destination only when its move is saved`(): Unit = runTest {
        store.entries += summary("mail", "Mail")
        store.secrets["mail" to "password"] = "hunter2"
        val form = editForm("mail")
        val picker = GroupPickerModel(form.state.value.group, store, 1uL, modelScope())
        advanceUntilIdle()
        picker.beginNewGroup()
        checkNotNull(picker.newGroup.value).input.setTextAndPlaceCursorAtEnd("Work")

        form.setGroup(checkNotNull(picker.chooseNewGroup()))
        picker.close()

        assertTrue(store.groups.isEmpty())
        assertTrue(store.updates.isEmpty())
        assertEquals("Mail", form.state.value.value(Field.TITLE))
        assertEquals("hunter2", form.state.value.value(Field.PASSWORD))

        form.save()
        advanceUntilIdle()

        assertEquals("/Work", store.updates.single().groupPath)
        assertEquals("mail", store.updates.single().entryID)
        assertEquals("/Work", store.entries.single().groupPath)
        assertEquals(setOf("/Work"), store.groups)
        assertTrue("an unchanged password is not rewritten", store.secretWrites.isEmpty())
        assertTrue(store.ensuredGroups.isEmpty())
    }

    @Test
    public fun `discarding a draft with a new destination creates neither group nor record`(): Unit = runTest {
        val form = newForm(Kind.LOGIN)
        form.change(Field.TITLE, "Mail")
        form.change(Field.PASSWORD, "hunter2")
        form.setGroup("/Work/Travel")

        assertFalse(form.requestDismiss())
        assertTrue(form.state.value.confirmingDiscard)
        form.revoke()
        advanceUntilIdle()

        assertTrue(store.groups.isEmpty())
        assertTrue(store.entries.isEmpty())
        assertTrue(store.creates.isEmpty())
        assertTrue(store.ensuredGroups.isEmpty())
        assertTrue(saved.isEmpty())
    }

    private suspend fun TestScope.assertGroupRefusal(editing: Boolean) {
        val checked = mutableListOf<String>()
        val reader = object : CredentialStore by store {
            override suspend fun groupPage(
                parent: String,
                offset: Long,
                generation: ULong,
            ): PassmanagerGroupPageResponse {
                checked += parent
                val code = if (parent == "/Work/..") "INVALID_PATH" else "NODE_NOT_FOUND"
                throw CoreRefusal(code, "passmanager:group:page")
            }
        }
        val form = if (editing) {
            store.entries += summary("mail", "Mail")
            store.secrets["mail" to "password"] = "hunter2"
            editForm("mail", reader)
        } else {
            newForm(Kind.LOGIN, reader).also {
                it.change(Field.TITLE, "Mail")
                it.change(Field.PASSWORD, "hunter2")
            }
        }
        form.setGroup("/Work/..")

        form.save()
        advanceUntilIdle()

        assertEquals(Status.EDITING, form.state.value.status)
        assertEquals(mapOf(Field.GROUP to FieldError.GROUP), form.state.value.errors)
        assertEquals(Field.GROUP, form.state.value.focus)
        assertEquals("/Work/..", form.state.value.group)
        assertEquals("Mail", form.state.value.value(Field.TITLE))
        assertEquals("hunter2", form.state.value.value(Field.PASSWORD))
        assertTrue(store.groups.isEmpty())
        assertEquals(listOf("/Work/.."), checked)
        assertTrue(store.creates.isEmpty())
        assertTrue(store.updates.isEmpty())
        assertTrue(saved.isEmpty())

        form.change(Field.GROUP, "/Work/Travel")
        assertTrue(form.state.value.errors.isEmpty())
        form.save()
        advanceUntilIdle()

        assertEquals(Status.SAVED, form.state.value.status)
        assertEquals("/Work/Travel", store.entries.single().groupPath)
        assertEquals(setOf("/Work", "/Work/Travel"), store.groups)
        assertEquals(listOf("/Work/..", "/Work/Travel"), checked)
        assertTrue(store.ensuredGroups.isEmpty())
    }

    @Test
    public fun `Core invalid path on create points to the group and permits correction`(): Unit = runTest {
        assertGroupRefusal(editing = false)
    }

    @Test
    public fun `Core invalid path on edit points to the group and permits correction`(): Unit = runTest {
        assertGroupRefusal(editing = true)
    }

    @Test
    public fun `an unavailable group check keeps the draft editable and writes nothing`(): Unit = runTest {
        var failing = true
        val reader = object : CredentialStore by store {
            override suspend fun groupPage(
                parent: String,
                offset: Long,
                generation: ULong,
            ): PassmanagerGroupPageResponse {
                val code = if (failing) "INTERNAL_ERROR" else "NODE_NOT_FOUND"
                throw CoreRefusal(code, "passmanager:group:page")
            }
        }
        val form = newForm(Kind.LOGIN, reader)
        form.change(Field.TITLE, "Mail")
        form.change(Field.PASSWORD, "hunter2")
        form.setGroup("/Work/Travel")

        form.save()
        advanceUntilIdle()

        assertEquals(Status.EDITING, form.state.value.status)
        assertEquals(Issue.GROUP_FAILED, form.state.value.issue)
        assertEquals("Mail", form.state.value.value(Field.TITLE))
        assertEquals("hunter2", form.state.value.value(Field.PASSWORD))
        assertEquals("/Work/Travel", form.state.value.group)
        assertTrue(form.state.value.errors.isEmpty())
        assertTrue(store.creates.isEmpty())
        assertTrue(store.updates.isEmpty())
        assertTrue(store.groups.isEmpty())
        assertTrue(store.ensuredGroups.isEmpty())

        failing = false
        form.save()
        advanceUntilIdle()

        assertEquals(Status.SAVED, form.state.value.status)
        assertEquals("/Work/Travel", store.creates.single().groupPath)
        assertEquals(setOf("/Work", "/Work/Travel"), store.groups)
    }

    @Test
    public fun `a denied group check explains the refusal without attempting Save`(): Unit = runTest {
        val reader = object : CredentialStore by store {
            override suspend fun groupPage(
                parent: String,
                offset: Long,
                generation: ULong,
            ): PassmanagerGroupPageResponse = throw CoreRefusal("ACCESS_DENIED", "passmanager:group:page")
        }
        val form = newForm(Kind.LOGIN, reader)
        form.change(Field.TITLE, "Mail")
        form.setGroup("/Work")

        form.save()
        advanceUntilIdle()

        assertEquals(Status.EDITING, form.state.value.status)
        assertEquals(Issue.DENIED, form.state.value.issue)
        assertEquals("Mail", form.state.value.value(Field.TITLE))
        assertEquals("/Work", form.state.value.group)
        assertTrue(store.creates.isEmpty())
        assertTrue(store.groups.isEmpty())
    }

    @Test
    public fun `an internal create failure after checking the group remains an uncertain Save`(): Unit = runTest {
        store.groups += "/Work"
        val reader = object : CredentialStore by store {
            override suspend fun createCredential(
                request: PassmanagerEntryCreateRequest,
                generation: ULong,
            ): PassmanagerEntrySaveResponse = throw CoreRefusal("INTERNAL_ERROR", "passmanager:entry:create")
        }
        val form = newForm(Kind.LOGIN, reader)
        form.change(Field.TITLE, "Mail")
        form.setGroup("/Work")

        form.save()
        advanceUntilIdle()

        assertEquals(Status.NEEDS_RELOAD, form.state.value.status)
        assertEquals(Issue.UNCERTAIN, form.state.value.issue)
        assertTrue(form.state.value.errors.isEmpty())
        assertEquals("/Work", form.state.value.group)
        assertTrue(saved.isEmpty())
    }

    @Test
    public fun `a malformed card code after checking the group is not blamed on the group`(): Unit = runTest {
        store.groups += "/Work"
        val checked = mutableListOf<String>()
        val reader = object : CredentialStore by store {
            override suspend fun groupPage(
                parent: String,
                offset: Long,
                generation: ULong,
            ): PassmanagerGroupPageResponse {
                checked += parent
                return store.groupPage(parent, offset, generation)
            }

            override suspend fun createCredential(
                request: PassmanagerEntryCreateRequest,
                generation: ULong,
            ): PassmanagerEntrySaveResponse {
                assertEquals("1", request.secrets.cardCvv)
                throw CoreRefusal("EMPTY_PAYLOAD", "passmanager:entry:create")
            }
        }
        val form = newForm(Kind.CARD, reader)
        form.change(Field.CARDHOLDER, "ALICE")
        form.change(Field.CARD_NUMBER, "4111111111111111")
        form.change(Field.MONTH, "3")
        form.change(Field.YEAR, "35")
        form.change(Field.CARD_CODE, "1")
        form.setGroup("/Work")

        form.save()
        advanceUntilIdle()

        assertEquals(listOf("/Work"), checked)
        assertEquals(Status.EDITING, form.state.value.status)
        assertEquals(Issue.INVALID, form.state.value.issue)
        assertTrue(form.state.value.errors.isEmpty())
        assertEquals("1", form.state.value.value(Field.CARD_CODE))
        assertEquals("/Work", form.state.value.group)
        assertTrue(store.creates.isEmpty())
        assertTrue(saved.isEmpty())
    }
}
