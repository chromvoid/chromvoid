import ChromVoidBridge
import Foundation

/// One in-flight task with stale-result protection. Every `start` supersedes the previous
/// run; a body applies its result only while `run.isCurrent`, so a reload that overtakes
/// another, a revoke, or a cancelled task can never write an outdated answer into a model.
@MainActor
public final class ModelWork {
  private var epoch = 0
  private var task: Task<Void, Never>?

  public init() {}

  public var isRunning: Bool { task != nil }

  /// Supersedes the running task; results of every earlier run are dropped.
  public func cancel() {
    epoch += 1
    task?.cancel()
    task = nil
  }

  /// Starts a run that supersedes the previous one. `run.isCurrent` is the only guard the body
  /// needs after each `await`.
  @discardableResult
  public func start(_ body: @escaping @MainActor (_ run: ModelRun) async -> Void)
    -> Task<Void, Never>
  {
    cancel()
    let run = ModelRun(work: self, epoch: epoch)
    let task = Task { [weak self] in
      await body(run)
      guard let self, run.isCurrent else { return }
      self.task = nil
    }
    self.task = task
    return task
  }

  fileprivate func isCurrent(_ epoch: Int) -> Bool { self.epoch == epoch }
}

/// Handle of one run of a `ModelWork`; stays current until the work is cancelled or restarted.
public struct ModelRun: Sendable {
  private let work: ModelWork
  private let epoch: Int

  fileprivate init(work: ModelWork, epoch: Int) {
    self.work = work
    self.epoch = epoch
  }

  /// False once another run started, the work was cancelled, or the task itself was cancelled.
  @MainActor public var isCurrent: Bool { work.isCurrent(epoch) && !Task.isCancelled }
}

extension Error {
  /// Core revoked the session behind this call: the model must drop everything, not show
  /// an error.
  public var isSessionRevoked: Bool {
    if let bridge = self as? BridgeError, case .SessionRevoked = bridge { return true }
    return coreFailure?.kind == .revoked
  }
}
