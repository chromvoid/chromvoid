import ChromVoidBridge
import SwiftUI

struct MarkdownPreviewView: View {
  @AirLocalizedCopy private var copy
  var model: DocumentModel

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        if let document = model.preview {
          LazyVStack(alignment: .leading, spacing: 16) {
            ForEach(document.roots, id: \.self) { id in
              MarkdownBlockView(
                model: model, document: document, nodeID: id)
            }
          }
          .id(document.sourceDigest)
          .frame(maxWidth: 760, alignment: .leading)
          .frame(maxWidth: .infinity, alignment: .center)
          .padding(.vertical, 8)
          .disabled(model.previewLoading || model.resolvingLink)
        } else if model.previewLoading {
          ProgressView(copy.text("Preparing preview…"))
            .frame(maxWidth: .infinity)
        }
      }
      .onChange(of: model.anchorJump) { _, jump in
        if let jump { proxy.scrollTo(jump.nodeID, anchor: .top) }
      }
      .environment(
        \.openURL,
        OpenURLAction { url in
          if let external = model.activatePreviewLink(url) { return .systemAction(external) }
          return .handled
        })
    }
    .accessibilityIdentifier("markdownPreview")
  }
}

private struct MarkdownBlockView: View {
  @AirLocalizedCopy private var copy
  var model: DocumentModel
  let document: MarkdownDocument
  let nodeID: Int
  private var node: MarkdownNode { document.nodes[nodeID] }

  var body: some View { content.id(nodeID) }

  @ViewBuilder private var content: some View {
    switch node.content.kind {
    case .paragraph:
      MarkdownInlineView(model: model, document: document, ids: node.children)
        .frame(maxWidth: .infinity, alignment: .leading)
    case .heading:
      MarkdownInlineView(model: model, document: document, ids: node.children)
        .font(headingFont).fontWeight(.semibold)
        .frame(maxWidth: .infinity, alignment: .leading)
    case .quote:
      HStack(alignment: .top, spacing: 12) {
        Rectangle().fill(.secondary.opacity(0.35)).frame(width: 2)
        children
      }.fixedSize(horizontal: false, vertical: true)
    case .codeBlock:
      VStack(alignment: .leading, spacing: 6) {
        if let language = node.content.language, !language.isEmpty {
          Text(verbatim: language).font(.caption).foregroundStyle(.secondary)
        }
        ScrollView(.horizontal) {
          Text(MarkdownText.inline(document, node.children, locale: copy.locale))
            .font(.body.monospaced()).padding(12)
        }
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
      }
    case .list:
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(node.children.enumerated()), id: \.element) { index, id in
          HStack(alignment: .top, spacing: 8) {
            if let task = MarkdownText.task(in: document, item: id) {
              Button {
                _ = model.toggleTask(nodeID: task)
              } label: {
                Image(
                  systemName: document.nodes[task].content.checked == true
                    ? "checkmark.circle.fill" : "circle"
                )
                .frame(minWidth: 44, minHeight: 44, alignment: .top)
              }
              .buttonStyle(.plain).foregroundStyle(.tint)
              .accessibilityLabel(
                copy.text(
                  document.nodes[task].content.checked == true
                    ? "Completed task" : "Incomplete task")
              )
              .accessibilityIdentifier("markdownTask-\(task)")
            } else {
              Text(node.content.first.map { "\($0 + index)." } ?? "•")
                .foregroundStyle(.secondary).frame(minWidth: 24, alignment: .trailing)
            }
            MarkdownBlockView(model: model, document: document, nodeID: id)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
    case .item:
      children
    case .table:
      ScrollView(.horizontal) {
        Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 10) {
          ForEach(node.children, id: \.self) { rowID in
            GridRow {
              ForEach(Array(document.nodes[rowID].children.enumerated()), id: \.element) {
                column, cellID in
                MarkdownInlineView(
                  model: model, document: document, ids: document.nodes[cellID].children
                )
                .fontWeight(
                  document.nodes[rowID].content.kind == .tableHead ? .semibold : .regular
                )
                .fixedSize(horizontal: true, vertical: false)
                .gridColumnAlignment(columnAlignment(column))
              }
            }
          }
        }.padding(.vertical, 8)
      }
    case .rule:
      Divider()
    case .task:
      EmptyView()
    default:
      MarkdownInlineView(model: model, document: document, ids: [nodeID])
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private var children: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(MarkdownText.groups(document, node.children)) { group in
        if group.isInline {
          MarkdownInlineView(model: model, document: document, ids: group.ids)
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          MarkdownBlockView(
            model: model, document: document, nodeID: group.id)
        }
      }
    }
  }

  private var headingFont: Font {
    switch node.content.level {
    case 1: .title
    case 2: .title2
    case 3: .title3
    default: .headline
    }
  }

  private func columnAlignment(_ column: Int) -> HorizontalAlignment {
    guard let alignments = node.content.alignments, alignments.indices.contains(column) else {
      return .leading
    }
    switch alignments[column] {
    case .center: return .center
    case .markdownAlignmentRight: return .trailing
    default: return .leading
    }
  }
}

/// Rendering attributes only. Rust already owns syntax, destinations and source edits.
enum MarkdownText {
  static func inline(_ document: MarkdownDocument, _ ids: [Int], locale: Locale = .current)
    -> AttributedString
  {
    var result = AttributedString()
    for id in ids {
      let node = document.nodes[id]
      var value =
        node.content.text.map(AttributedString.init)
        ?? inline(document, node.children, locale: locale)
      switch node.content.kind {
      case .softBreak: value = AttributedString(" ")
      case .hardBreak: value = AttributedString("\n")
      case .task: continue
      case .image:
        value = AttributedString(AirCopy(locale: locale).text("Image") + ": ") + value
        if node.content.target?.kind == .blocked {
          value.append(AttributedString(" — " + AirCopy(locale: locale).text("Image unavailable")))
        } else {
          value.link = linkURL(id)
        }
      default: decorate(&value, node: node, id: id)
      }
      result.append(value)
    }
    return result
  }

  struct Segment: Identifiable {
    let id: Int
    var text: AttributedString?
    var imageID: Int?
    var activationID: Int?
  }

  static func segments(_ document: MarkdownDocument, _ ids: [Int], locale: Locale = .current)
    -> [Segment]
  {
    var result: [Segment] = []
    for id in ids {
      let node = document.nodes[id]
      let parts: [Segment]
      if node.content.kind == .image,
        node.content.target?.kind == .catalog || node.content.target?.kind == .note
      {
        parts = [Segment(id: id, imageID: id, activationID: id)]
      } else if [.emphasis, .strong, .strikethrough, .link].contains(node.content.kind) {
        parts = segments(document, node.children, locale: locale).map { part in
          var part = part
          if var text = part.text {
            decorate(&text, node: node, id: id)
            part.text = text
          } else if node.content.kind == .link {
            part.activationID = node.content.target?.kind == .blocked ? nil : id
          }
          return part
        }
      } else {
        parts = [Segment(id: id, text: inline(document, [id], locale: locale))]
      }
      for part in parts {
        if let text = part.text, result.last?.text != nil {
          result[result.count - 1].text?.append(text)
        } else {
          result.append(part)
        }
      }
    }
    return result
  }

  struct Group: Identifiable {
    let id: Int
    var ids: [Int]
    let isInline: Bool
  }

  static func groups(_ document: MarkdownDocument, _ ids: [Int]) -> [Group] {
    var groups: [Group] = []
    for id in ids where document.nodes[id].content.kind != .task {
      let isInline: Bool
      switch document.nodes[id].content.kind {
      case .paragraph, .heading, .quote, .codeBlock, .list, .item, .table, .tableHead, .tableRow,
        .tableCell, .rule:
        isInline = false
      default: isInline = true
      }
      if isInline, groups.last?.isInline == true {
        groups[groups.count - 1].ids.append(id)
      } else {
        groups.append(Group(id: id, ids: [id], isInline: isInline))
      }
    }
    return groups
  }

  private static func decorate(_ text: inout AttributedString, node: MarkdownNode, id: Int) {
    switch node.content.kind {
    case .emphasis: addIntent(.emphasized, to: &text)
    case .strong: addIntent(.stronglyEmphasized, to: &text)
    case .strikethrough: text.strikethroughStyle = .single
    case .code: text.font = Font.system(.body, design: .monospaced)
    case .link:
      if node.content.target?.kind != .blocked { text.link = linkURL(id) }
    default: break
    }
  }

  private static func addIntent(
    _ intent: InlinePresentationIntent, to value: inout AttributedString
  ) {
    let runs = value.runs.map { ($0.range, $0.inlinePresentationIntent ?? []) }
    for (range, current) in runs { value[range].inlinePresentationIntent = current.union(intent) }
  }

  static func task(in document: MarkdownDocument, item: Int) -> Int? {
    guard let first = document.nodes[item].children.first else { return nil }
    if document.nodes[first].content.kind == .task { return first }
    if document.nodes[first].content.kind == .paragraph {
      return document.nodes[first].children.first { document.nodes[$0].content.kind == .task }
    }
    return nil
  }

  static func linkURL(_ id: Int) -> URL? {
    URL(string: "chromvoid-markdown://link/\(id)")
  }
}
