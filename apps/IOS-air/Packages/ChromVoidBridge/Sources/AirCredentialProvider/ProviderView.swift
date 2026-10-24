import SwiftUI

@MainActor
enum ProviderCopy {
  static func text(_ key: String) -> String {
    String(localized: String.LocalizationValue(key), bundle: .module)
  }
}

struct ProviderView: View {
  @ObservedObject var model: ProviderModel
  let cancel: () -> Void

  var body: some View {
    NavigationStack {
      List {
        if model.busy {
          HStack {
            Spacer()
            ProgressView()
            Spacer()
          }
        } else if let message = model.message {
          Section { Text(message).foregroundStyle(.secondary) }
        } else {
          ForEach(model.choices) { choice in
            Button {
              model.choose(choice)
            } label: {
              Label {
                VStack(alignment: .leading, spacing: 4) {
                  Text(choice.title).foregroundStyle(.primary)
                  Text(choice.subtitle).font(.subheadline).foregroundStyle(.secondary)
                }
              } icon: {
                Image(systemName: choice.symbol)
              }
            }
            .buttonStyle(.plain)
          }
        }
      }
      .navigationTitle(ProviderCopy.text("ChromVoid Air"))
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(
            model.isConfiguration ? ProviderCopy.text("Done") : ProviderCopy.text("Cancel"),
            action: cancel)
        }
      }
    }
  }
}
