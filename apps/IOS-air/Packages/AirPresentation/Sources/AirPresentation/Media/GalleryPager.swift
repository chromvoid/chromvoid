import SwiftUI
import UIKit

/// Photos-style paging: a `UIPageViewController` keeps one hosting controller per page alive
/// and moves between them interactively, so model updates behind the scenes never rebuild the
/// visible page, and a swipe is never blocked by SwiftUI re-laying out the pager.
struct GalleryPager<Item: Identifiable, Page: View>: UIViewControllerRepresentable
where Item.ID: Hashable {
  let items: [Item]
  @Binding var selection: Item.ID
  @ViewBuilder let page: (Item) -> Page

  func makeUIViewController(context: Context) -> UIPageViewController {
    let controller = UIPageViewController(
      transitionStyle: .scroll, navigationOrientation: .horizontal,
      options: [.interPageSpacing: 12])
    controller.dataSource = context.coordinator
    controller.delegate = context.coordinator
    controller.view.backgroundColor = .clear
    context.coordinator.apply(items: items, selection: selection, to: controller, animated: false)
    return controller
  }

  func updateUIViewController(_ controller: UIPageViewController, context: Context) {
    context.coordinator.pager = self
    context.coordinator.apply(items: items, selection: selection, to: controller, animated: true)
  }

  func makeCoordinator() -> Coordinator { Coordinator(pager: self) }

  final class Coordinator: NSObject, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
    var pager: GalleryPager
    private var controllers: [Item.ID: UIHostingController<Page>] = [:]
    private var shownID: Item.ID?

    init(pager: GalleryPager) { self.pager = pager }

    func apply(
      items: [Item], selection: Item.ID, to controller: UIPageViewController, animated: Bool
    ) {
      let ids = Set(items.map(\.id))
      controllers = controllers.filter { ids.contains($0.key) }
      for (id, hosting) in controllers {
        if let item = items.first(where: { $0.id == id }) { hosting.rootView = pager.page(item) }
      }
      guard let item = items.first(where: { $0.id == selection }) else { return }
      if shownID == selection { return }
      let direction: UIPageViewController.NavigationDirection =
        index(of: selection) ?? 0 >= (shownID.flatMap(index(of:)) ?? 0) ? .forward : .reverse
      let target = page(for: item)
      let move = animated && shownID != nil && !(controller.viewControllers ?? []).isEmpty
      shownID = selection
      controller.setViewControllers([target], direction: direction, animated: move)
    }

    private func index(of id: Item.ID) -> Int? { pager.items.firstIndex { $0.id == id } }

    private func page(for item: Item) -> UIHostingController<Page> {
      if let existing = controllers[item.id] { return existing }
      let hosting = UIHostingController(rootView: pager.page(item))
      hosting.view.backgroundColor = .clear
      controllers[item.id] = hosting
      return hosting
    }

    private func neighbour(of viewController: UIViewController, offset: Int) -> UIViewController? {
      guard let id = controllers.first(where: { $0.value === viewController })?.key,
        let index = index(of: id), pager.items.indices.contains(index + offset)
      else { return nil }
      return page(for: pager.items[index + offset])
    }

    func pageViewController(
      _ pageViewController: UIPageViewController,
      viewControllerBefore viewController: UIViewController
    ) -> UIViewController? { neighbour(of: viewController, offset: -1) }

    func pageViewController(
      _ pageViewController: UIPageViewController,
      viewControllerAfter viewController: UIViewController
    ) -> UIViewController? { neighbour(of: viewController, offset: 1) }

    func pageViewController(
      _ pageViewController: UIPageViewController, didFinishAnimating finished: Bool,
      previousViewControllers: [UIViewController], transitionCompleted completed: Bool
    ) {
      guard completed, let current = pageViewController.viewControllers?.first,
        let id = controllers.first(where: { $0.value === current })?.key
      else { return }
      shownID = id
      if pager.selection != id { pager.selection = id }
    }
  }
}
