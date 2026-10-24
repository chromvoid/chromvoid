import SwiftUI

struct AcknowledgmentsView: View {
  @AirLocalizedCopy private var copy
  @State private var model = AcknowledgmentsModel()

  var body: some View {
    Group {
      switch model.state {
      case .idle, .loading:
        ProgressView(copy.text("Loading notices…"))
      case .failed:
        VStack(spacing: 16) {
          Text(copy.text("Could not load the included notices."))
          Button(copy.text("Try again")) { Task { await model.load() } }
        }
        .padding()
      case .ready(let catalog):
        List {
          if model.entries.isEmpty {
            Text(copy.text("No matching components"))
              .foregroundStyle(.secondary)
          }
          ForEach(model.entries) { entry in
            NavigationLink {
              AcknowledgmentsEntryView(entry: entry, texts: catalog.texts)
            } label: {
              VStack(alignment: .leading, spacing: 4) {
                Text(entry.name)
                Text(entry.version).font(.caption).foregroundStyle(.secondary)
              }
            }
          }
        }
        .airCanvas()
      }
    }
    .searchable(
      text: Binding(get: { model.query }, set: { model.setQuery($0) }),
      placement: .navigationBarDrawer(displayMode: .always),
      prompt: copy.text("Component or license")
    )
    .navigationTitle(copy.text("Third-party components"))
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("acknowledgmentsScreen")
    .task { await model.load() }
  }
}

private struct AcknowledgmentsEntryView: View {
  @AirLocalizedCopy private var copy
  let entry: AcknowledgmentsCatalog.Entry
  let texts: [String: String]

  var body: some View {
    List {
      Section {
        LabeledContent(copy.text("Version"), value: entry.version)
        if let license = entry.license {
          Text(license)
        }
      }
      Section(copy.text("Notices")) {
        ForEach(entry.documents) { document in
          if let text = texts[document.textID] {
            NavigationLink {
              AcknowledgmentTextView(title: document.title, text: text)
            } label: {
              Text(document.title)
            }
          }
        }
      }
    }
    .airCanvas()
    .navigationTitle(entry.name)
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct AcknowledgmentTextView: View {
  let title: String
  let paragraphs: [String]

  init(title: String, text: String) {
    self.title = title
    paragraphs = text.components(separatedBy: "\n\n").filter { !$0.isEmpty }
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 16) {
        ForEach(paragraphs.indices, id: \.self) { index in
          Text(verbatim: paragraphs[index])
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .padding()
      .textSelection(.enabled)
    }
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("acknowledgmentText")
  }
}
