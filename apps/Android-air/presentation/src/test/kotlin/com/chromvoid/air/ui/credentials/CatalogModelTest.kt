package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.many
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class CatalogModelTest {
    private val clipboard = FakeClipboard()

    private fun TestScope.catalog(store: FakeCredentialStore, groupPath: String? = null): CatalogModel = CatalogModel(
        store,
        generation = 1uL,
        scope = modelScope(),
        clipboard = clipboard,
        groupPath = groupPath,
    ).also { advanceUntilIdle() }

    @Test
    public fun `a page asks for the icons of the records it showed`(): Unit = runTest {
        val store = FakeCredentialStore(
            listOf(
                summary("a", "Mail").copy(iconRef = "icon-a"),
                summary("b", "Bank"),
                summary("c", "Work").copy(iconRef = "icon-c"),
            ),
        )
        val icons = CredentialIconCache(store, generation = 1uL, scope = modelScope(), decode = { null })
        CatalogModel(store, generation = 1uL, scope = modelScope(), clipboard = clipboard, icons = icons)
        advanceUntilIdle()

        // Only the digests the page carried, and a record without one asks for nothing.
        assertEquals(listOf(listOf("icon-a", "icon-c")), store.iconRequests)
    }

    @Test
    public fun `the first page is read on open`(): Unit = runTest {
        val model = catalog(FakeCredentialStore(listOf(summary("a", "Mail"), summary("b", "Bank"))))

        assertEquals(CatalogModel.Status.READY, model.state.value.status)
        assertEquals(listOf("Mail", "Bank"), model.state.value.entries.map { it.title })
    }

    @Test
    public fun `the root shows direct records before records in nested groups`(): Unit = runTest {
        val model = catalog(
            FakeCredentialStore(
                listOf(
                    summary("work", "Work mail").copy(groupPath = "/Work"),
                    summary("root", "Personal mail"),
                    summary("deep", "Project mail").copy(groupPath = "/Work/Project"),
                    summary("empty", "Bank").copy(groupPath = ""),
                ),
            ),
        )

        val sections = model.state.value.sections
        assertEquals(listOf(false, true), sections.map { it.isNested })
        assertEquals(listOf("root", "empty"), sections[0].entries.map { it.id })
        assertEquals(listOf("work", "deep"), sections[1].entries.map { it.id })
        assertEquals(listOf(null, null), sections.map { it.groupKey })
    }

    @Test
    public fun `a group separates its own records from its descendants without including a sibling`(): Unit = runTest {
        for (path in listOf("Work", "/Work")) {
            val store = FakeCredentialStore(
                listOf(
                    summary("child", "Project mail").copy(groupPath = "$path/Project"),
                    summary("direct", "Work mail").copy(groupPath = path),
                    summary("sibling", "Workplace mail").copy(groupPath = "${path}place"),
                    summary("deep", "Team mail").copy(groupPath = "$path/Project/Team"),
                    summary("root", "Personal mail"),
                ),
            )
            val model = catalog(store, groupPath = path)

            assertEquals(path, store.pageRequests.single().groupPath)
            assertEquals(listOf("child", "direct", "deep"), model.state.value.entries.map { it.id })
            val sections = model.state.value.sections
            assertEquals(listOf(false, true), sections.map { it.isNested })
            assertEquals(listOf("direct"), sections[0].entries.map { it.id })
            assertEquals(listOf("child", "deep"), sections[1].entries.map { it.id })
        }
    }

    @Test
    public fun `empty direct and nested sections are omitted`(): Unit = runTest {
        val model = catalog(FakeCredentialStore(listOf(summary("root", "Personal mail"))))
        assertEquals(listOf(false), model.state.value.sections.map { it.isNested })

        val nestedOnly = catalog(
            FakeCredentialStore(listOf(summary("work", "Work mail").copy(groupPath = "/Work"))),
        )
        assertEquals(listOf(true), nestedOnly.state.value.sections.map { it.isNested })
        assertFalse(nestedOnly.state.value.isEmptyVault)

        assertTrue(catalog(FakeCredentialStore()).state.value.sections.isEmpty())
    }

    @Test
    public fun `only a nonblank search removes the direct and nested division`(): Unit = runTest {
        val model = catalog(
            FakeCredentialStore(
                listOf(
                    summary("work", "Work mail").copy(groupPath = "/Work"),
                    summary("root", "Personal mail"),
                    summary("bank", "Bank"),
                ),
            ),
        )

        model.search(" \t ")
        advanceUntilIdle()
        assertEquals(listOf(false, true), model.state.value.sections.map { it.isNested })

        model.search(" mail ")
        advanceUntilIdle()
        val sections = model.state.value.sections
        assertEquals(1, sections.size)
        assertFalse(sections.single().isNested)
        assertEquals(listOf("work", "root"), sections.single().entries.map { it.id })
    }

    @Test
    public fun `Core grouping keeps its section order instead of separating nested records`(): Unit = runTest {
        val model = catalog(
            FakeCredentialStore(
                listOf(
                    summary("work", "Work mail", website = "mail.example").copy(groupPath = "/Work"),
                    summary("root", "Personal mail", website = "mail.example"),
                    summary("bank", "Bank", website = "bank.example"),
                ),
            ),
        )

        model.setOptions(CatalogOptions(grouping = CatalogOptions.Grouping.WEBSITE))
        advanceUntilIdle()

        val sections = model.state.value.sections
        assertEquals(listOf("mail.example", "bank.example"), sections.map { it.groupKey })
        assertTrue(sections.none { it.isNested })
        assertEquals(listOf("work", "root"), sections[0].entries.map { it.id })
        assertEquals(listOf("bank"), sections[1].entries.map { it.id })

        // A reload keeps the last page visible; disabling grouping during search keeps it as one list.
        model.search("mail")
        model.setOptions(CatalogOptions())
        val reloading = model.state.value
        assertEquals(CatalogModel.Status.LOADING, reloading.status)
        assertEquals(listOf("work", "root", "bank"), reloading.sections.single().entries.map { it.id })
        assertFalse(reloading.sections.single().isNested)
        advanceUntilIdle()
        assertEquals(listOf("work", "root"), model.state.value.sections.single().entries.map { it.id })
    }

    @Test
    public fun `a type filter narrows both direct and nested sections`(): Unit = runTest {
        val model = catalog(
            FakeCredentialStore(
                listOf(
                    summary("work", "Work mail").copy(groupPath = "/Work"),
                    summary("card", "Work card").copy(groupPath = "/Work", entryType = "payment_card"),
                    summary("root", "Personal mail"),
                    summary("root-card", "Personal card").copy(entryType = "payment_card"),
                ),
            ),
        )

        model.setOptions(CatalogOptions(kind = CatalogOptions.Kind.LOGINS))
        advanceUntilIdle()

        val sections = model.state.value.sections
        assertEquals(listOf(false, true), sections.map { it.isNested })
        assertEquals(listOf("root"), sections[0].entries.map { it.id })
        assertEquals(listOf("work"), sections[1].entries.map { it.id })
    }

    @Test
    public fun `a tag and a quick filter narrow the records without removing the division`(): Unit = runTest {
        val store = FakeCredentialStore(
            listOf(
                summary("work", "Work mail").copy(groupPath = "/Work", hasCodes = true),
                summary("root", "Personal mail").copy(hasCodes = true),
                summary("without-codes", "Work bank").copy(groupPath = "/Work"),
                summary("untagged", "Other mail").copy(hasCodes = true),
            ),
        ).apply {
            tags["mail"] = "Mail" to "blue"
            entryTags["work"] = setOf("mail")
            entryTags["root"] = setOf("mail")
            entryTags["without-codes"] = setOf("mail")
        }
        val model = catalog(store)

        model.filterTag(CredentialTagSummary(colorID = "blue", count = 3, key = "mail", label = "Mail"))
        advanceUntilIdle()
        model.setOptions(CatalogOptions(quickFilters = setOf(CatalogOptions.QuickFilter.WITH_CODES)))
        advanceUntilIdle()

        val sections = model.state.value.sections
        assertEquals(listOf(false, true), sections.map { it.isNested })
        assertEquals(listOf("root"), sections[0].entries.map { it.id })
        assertEquals(listOf("work"), sections[1].entries.map { it.id })
    }

    @Test
    public fun `loading more records grows both sections while preserving each section order`(): Unit = runTest {
        val entries = many(80).mapIndexed { index, entry ->
            entry.copy(groupPath = if (index % 2 == 0) "/Work" else "/")
        }
        val store = FakeCredentialStore(entries)
        val model = catalog(store)

        val firstPage = model.state.value.sections
        assertEquals(listOf(25, 25), firstPage.map { it.entries.size })
        assertTrue(model.state.value.canLoadMore)

        model.loadMore()
        advanceUntilIdle()

        val sections = model.state.value.sections
        assertEquals(listOf(false, true), sections.map { it.isNested })
        assertEquals((2..80 step 2).map { "id-$it" }, sections[0].entries.map { it.id })
        assertEquals((1..80 step 2).map { "id-$it" }, sections[1].entries.map { it.id })
        assertEquals(listOf(0L, 50L), store.pageRequests.map { it.offset })
        assertFalse(model.state.value.canLoadMore)
    }

    @Test
    public fun `typing a word costs one search, not one per letter`(): Unit = runTest {
        val store = FakeCredentialStore(listOf(summary("a", "GitHub"), summary("b", "Mail")))
        val model = catalog(store)
        store.pageRequests.clear()

        model.search("g")
        advanceTimeBy(CatalogModel.SEARCH_DELAY_MILLIS / 2)
        model.search("gi")
        advanceTimeBy(CatalogModel.SEARCH_DELAY_MILLIS / 2)
        model.search("git")
        advanceUntilIdle()

        assertEquals(listOf("git"), store.pageRequests.map { it.query })
        assertEquals(listOf("GitHub"), model.state.value.entries.map { it.title })
    }

    @Test
    public fun `an empty vault and a search that matched nothing are told apart`(): Unit = runTest {
        val empty = catalog(FakeCredentialStore())
        assertTrue(empty.state.value.isEmptyVault)
        assertFalse(empty.state.value.isNoMatch)

        val model = catalog(FakeCredentialStore(listOf(summary("a", "Mail"))))
        model.search("zzz")
        advanceUntilIdle()
        assertTrue(model.state.value.isNoMatch)
        assertFalse(model.state.value.isEmptyVault)

        model.clearSearch()
        advanceUntilIdle()
        assertEquals(listOf("Mail"), model.state.value.entries.map { it.title })
    }

    @Test
    public fun `further pages append in order until Core has no more`(): Unit = runTest {
        val model = catalog(FakeCredentialStore(many(120)))
        assertEquals(50, model.state.value.entries.size)
        assertTrue(model.state.value.canLoadMore)

        model.loadMore()
        advanceUntilIdle()
        model.loadMore()
        advanceUntilIdle()

        assertEquals((1..120).map { "id-$it" }, model.state.value.entries.map { it.id })
        assertFalse(model.state.value.canLoadMore)
    }

    @Test
    public fun `a page that repeats a record is a failure, not a longer list`(): Unit = runTest {
        val store = FakeCredentialStore(many(60))
        val model = catalog(store)
        store.entries.add(0, store.entries[55])

        model.loadMore()
        advanceUntilIdle()

        assertEquals(CatalogModel.Status.FAILED, model.state.value.status)
        assertTrue("nothing stale stays on screen", model.state.value.entries.isEmpty())
    }

    @Test
    public fun `a failed read offers a retry that reads again`(): Unit = runTest {
        val store = FakeCredentialStore(listOf(summary("a", "Mail")))
        store.failWith = CoreRefusal("INTERNAL", "passmanager:entry:page")
        val model = catalog(store)
        assertEquals(CatalogModel.Status.FAILED, model.state.value.status)

        store.failWith = null
        model.reload()
        advanceUntilIdle()
        assertEquals(listOf("Mail"), model.state.value.entries.map { it.title })
    }

    @Test
    public fun `a revoked session drops everything and asks nothing more`(): Unit = runTest {
        val store = FakeCredentialStore(listOf(summary("a", "Mail")))
        val model = catalog(store)
        store.failWith = BridgeException.SessionRevoked()

        model.search("m")
        advanceUntilIdle()
        assertEquals(CatalogModel.Status.REVOKED, model.state.value.status)
        assertTrue(model.state.value.entries.isEmpty())
        assertEquals("", model.state.value.query)

        store.pageRequests.clear()
        model.search("x")
        model.reload()
        advanceUntilIdle()
        assertTrue(store.pageRequests.isEmpty())
    }

    @Test
    public fun `a quick copy takes the primary secret straight to the clipboard`(): Unit = runTest {
        val store = FakeCredentialStore(
            listOf(summary("mail", "Mail"), summary("card", "Visa").copy(entryType = "payment_card")),
        )
        store.secrets["mail" to "password"] = "hunter2"
        store.secrets["card" to "card_pan"] = "4111111111111111"
        val model = catalog(store)

        model.quickCopy(model.state.value.entries[0])
        advanceUntilIdle()
        model.quickCopy(model.state.value.entries[1])
        advanceUntilIdle()

        assertEquals(listOf("hunter2" to true, "4111111111111111" to true), clipboard.copies)
        assertEquals(2, model.state.value.quickCopies)
    }

    @Test
    public fun `a row still on screen copies while a search reloads the list`(): Unit = runTest {
        val store = FakeCredentialStore(listOf(summary("mail", "Mail"), summary("bank", "Bank")))
        store.secrets["mail" to "password"] = "hunter2"
        val model = catalog(store)
        val mail = model.state.value.entries[0]

        model.search("ma")
        assertEquals(CatalogModel.Status.LOADING, model.state.value.status)
        model.quickCopy(mail)
        advanceUntilIdle()

        assertEquals(listOf("hunter2" to true), clipboard.copies)
        assertEquals(1, model.state.value.quickCopies)
    }

    @Test
    public fun `an empty field is explained and leaves the clipboard alone`(): Unit = runTest {
        val model = catalog(FakeCredentialStore(listOf(summary("mail", "Mail"))))

        model.quickCopy(model.state.value.entries[0])
        advanceUntilIdle()

        assertTrue(clipboard.copies.isEmpty())
        assertEquals("mail" to CredentialDetailModel.FieldIssue.EMPTY, model.state.value.quickCopyIssue)
    }

    @Test
    public fun `a tag narrows the list and clearing it shows everything again`(): Unit = runTest {
        val store = FakeCredentialStore(listOf(summary("mail", "Mail"), summary("bank", "Bank"))).apply {
            tags["work"] = "Work" to "blue"
            entryTags["mail"] = setOf("work")
        }
        val model = catalog(store)
        val work = CredentialTagSummary(colorID = "blue", count = 1, key = "work", label = "Work")

        model.filterTag(work)
        advanceUntilIdle()
        assertEquals(listOf("Mail"), model.state.value.entries.map { it.title })

        model.filterTag(null)
        advanceUntilIdle()
        assertEquals(listOf("Mail", "Bank"), model.state.value.entries.map { it.title })
    }

    @Test
    public fun `sort, type, filters and grouping are asked of Core, not applied to the page`(): Unit = runTest {
        val store = FakeCredentialStore(
            listOf(
                summary("b", "Bank", website = "bank.example"),
                summary("a", "Airline"),
                summary("c", "Card").copy(entryType = "payment_card"),
            ),
        )
        val model = catalog(store)

        model.setOptions(
            CatalogOptions(
                sort = CatalogOptions.Sort.NAME,
                descending = true,
                kind = CatalogOptions.Kind.LOGINS,
                quickFilters = setOf(CatalogOptions.QuickFilter.RECENT),
                grouping = CatalogOptions.Grouping.WEBSITE,
            ),
        )
        advanceUntilIdle()

        val request = store.pageRequests.last()
        assertEquals("name", request.sort)
        assertEquals(true, request.descending)
        assertEquals("login", request.entryType)
        assertEquals(listOf("recent"), request.quickFilters)
        assertEquals("website", request.groupBy)
        // Ordering is Core's; the page shows the records it returned, grouped by site.
        assertEquals(listOf("bank.example", ""), model.state.value.entries.map { it.groupKey })
    }

    @Test
    public fun `clearing filters keeps the sort and grouping`(): Unit = runTest {
        val model = catalog(FakeCredentialStore(listOf(summary("a", "Mail"))))
        model.setOptions(
            CatalogOptions(
                sort = CatalogOptions.Sort.MODIFIED,
                kind = CatalogOptions.Kind.CARDS,
                grouping = CatalogOptions.Grouping.WEBSITE,
            ),
        )
        advanceUntilIdle()
        assertTrue(model.state.value.isNoMatch)

        model.clearFilters()
        advanceUntilIdle()

        val options = model.state.value.options
        assertEquals(CatalogOptions.Kind.ALL, options.kind)
        assertEquals(CatalogOptions.Sort.MODIFIED, options.sort)
        assertEquals(CatalogOptions.Grouping.WEBSITE, options.grouping)
    }

    @Test
    public fun `a section key Core does not use for the grouping is a broken reply`(): Unit = runTest {
        val store = FakeCredentialStore(listOf(summary("a", "Mail")))
        val model = catalog(store)
        store.sectionOverride = "someday"

        model.setOptions(CatalogOptions(grouping = CatalogOptions.Grouping.MODIFIED))
        advanceUntilIdle()

        assertEquals(CatalogModel.Status.FAILED, model.state.value.status)
    }

    @Test
    public fun `a bulk delete asks first, and what Core refused stays selected`(): Unit = runTest {
        val store = FakeCredentialStore(listOf(summary("a", "Mail"), summary("b", "Bank"), summary("c", "Card")))
        store.refuseDeleteOf += "b"
        val model = catalog(store)

        model.beginSelection("a")
        model.toggleSelection("b")
        model.toggleSelection("c")
        model.confirmDelete()
        assertEquals("nothing is deleted without the confirmation", 3, store.entries.size)

        model.requestDelete()
        model.confirmDelete()
        advanceUntilIdle()

        assertEquals(listOf("b"), store.entries.map { it.id })
        assertEquals(setOf("b"), model.state.value.selection)
        assertEquals(1, model.state.value.deleteFailures)
        assertEquals(listOf("Bank"), model.state.value.entries.map { it.title })
        assertEquals("a delete takes back what was copied", 1, clipboard.clears)
    }

    @Test
    public fun `the Codes collection asks Core for logins with codes, once`(): Unit = runTest {
        val store = FakeCredentialStore(listOf(summary("mail", "Mail")))
        val model = catalog(store)

        model.setOptions(
            model.state.value.options.copy(
                kind = CatalogOptions.Kind.CODES,
                quickFilters = setOf(CatalogOptions.QuickFilter.WITH_CODES, CatalogOptions.QuickFilter.RECENT),
            ),
        )
        advanceUntilIdle()

        val request = store.pageRequests.last()
        assertEquals("login", request.entryType)
        assertEquals(setOf("otp", "recent"), request.quickFilters.orEmpty().toSet())
        assertEquals("no filter is sent twice", 2, request.quickFilters.orEmpty().size)
    }
}
