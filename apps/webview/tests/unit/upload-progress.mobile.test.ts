import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { atom } from "@reatom/core";

import { UploadProgressMobile } from "../../src/features/file-manager/components/upload-progress.mobile";
import { UploadProgressModel } from "../../src/features/file-manager/components/upload-progress.model";
import { UploadTask } from "../../src/types/upload-task";
import {
  clearAppContext,
  createMockAppContext,
  initAppContext,
} from "../../src/shared/services/app-context";
import { transientBackModel } from "../../src/shared/services/transient-back.model";

const isolateLtr = (value: string) => `\u2066${value}\u2069`;

function createUploadStats(tasks: UploadTask[]) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status() === "done").length;
  const failed = tasks.filter((t) => t.status() === "error").length;
  const uploading = tasks.filter(
    (t) => t.status() === "queued" || t.status() === "uploading",
  ).length;
  const totalBytes = tasks.reduce((sum, t) => sum + (t.total() || 0), 0);
  const loadedBytes = tasks.reduce((sum, t) => sum + (t.loaded() || 0), 0);
  const overallProgress = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0;
  return { total, completed, failed, uploading, overallProgress, totalBytes, loadedBytes };
}

async function settle(element: UploadProgressMobile) {
  await Promise.resolve();
  await element.updateComplete;
  await Promise.resolve();
}

describe("upload-progress-mobile", () => {
  beforeEach(() => {
    UploadProgressMobile.define();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    clearAppContext();
  });

  it("renders minimized transfer summary while uploads are active", async () => {
    const uploadTasks = atom<UploadTask[]>([]);

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<"mobile" | "desktop">("mobile"),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    );

    const task = new UploadTask({ id: "uploading-task", name: "archive.zip", total: 1_024 });
    task.setProgress(512);
    uploadTasks.set([task]);

    const model = new UploadProgressModel();
    const element = document.createElement("upload-progress-mobile") as UploadProgressMobile;
    element.model = model;
    document.body.appendChild(element);
    await settle(element);

    const text = element.shadowRoot?.textContent ?? "";
    expect(text).toContain(`Uploading files: ${isolateLtr("1")}`);
    expect(text).toContain("50%");
    expect(element.shadowRoot?.querySelector("cv-spinner.header-spinner")).not.toBeNull();

    const bar = element.shadowRoot?.querySelector<HTMLElement>(".minimized-bar");
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("data-tone")).toBe("active");
    expect(bar?.getAttribute("aria-live")).toBe("polite");
    expect(bar?.querySelector(".minimized-close-btn")).toBeNull();
    expect(bar?.querySelector(".bar-meta")?.textContent).toContain(
      `${isolateLtr("0")} of ${isolateLtr("1")}`,
    );
    expect(bar?.querySelector('.bar-meta bdi[dir="ltr"]')?.textContent).toBe("512 B / 1 KB");
    expect(bar?.querySelector('.bar-progress bdi[dir="ltr"]')?.textContent).toBe("50%");
    expect(bar?.querySelector(".minimized-progress-bar")).not.toBeNull();

    const mainButton = element.shadowRoot?.querySelector<HTMLButtonElement>(".minimized-main");
    expect(mainButton).not.toBeNull();
    expect(mainButton?.tagName).toBe("BUTTON");
    expect(mainButton?.getAttribute("type")).toBe("button");
    expect(mainButton?.getAttribute("aria-label")).toContain("Open transfer details");
    expect(mainButton?.getAttribute("aria-label")).toContain(`${isolateLtr("50")}%`);
    expect(mainButton?.getAttribute("aria-label")).toContain(isolateLtr("512 B / 1 KB"));

    const buttons = [...(element.shadowRoot?.querySelectorAll(".sheet-btn") ?? [])];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute("title")).toBe("Collapse");
  });

  it("dismisses active open-external tasks from the minimized status bar", async () => {
    const uploadTasks = atom<UploadTask[]>([]);
    const cancelUploadTask = vi.fn();

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<"mobile" | "desktop">("mobile"),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks: () => {},
          cancelUploadTask,
        } as any,
      }),
    );

    const task = new UploadTask({
      id: "open-external-task",
      name: "report.pdf",
      total: 0,
      kind: "open-external",
    });
    uploadTasks.set([task]);

    const model = new UploadProgressModel();
    const element = document.createElement("upload-progress-mobile") as UploadProgressMobile;
    element.model = model;
    document.body.appendChild(element);
    await settle(element);

    expect(element.shadowRoot?.textContent ?? "").toContain(
      `Preparing files: ${isolateLtr("1")}`,
    );

    const closeButton = element.shadowRoot?.querySelector<HTMLElement>(".minimized-close-btn");
    expect(closeButton).not.toBeNull();

    closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(cancelUploadTask).toHaveBeenCalledWith("open-external-task");
  });

  it("renders expanded footer progress and control labels", async () => {
    const uploadTasks = atom<UploadTask[]>([]);

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<"mobile" | "desktop">("mobile"),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    );

    const doneTask = new UploadTask({ id: "done-task", name: "done.bin", total: 1_024 });
    doneTask.markDone();
    const uploadingTask = new UploadTask({ id: "active-task", name: "active.bin", total: 1_024 });
    uploadingTask.setProgress(512);
    uploadTasks.set([doneTask, uploadingTask]);

    const model = new UploadProgressModel();
    model.expand();

    const element = document.createElement("upload-progress-mobile") as UploadProgressMobile;
    element.model = model;
    document.body.appendChild(element);
    await settle(element);

    const text = element.shadowRoot?.textContent ?? "";
    expect(text).toContain(`Uploading files: ${isolateLtr("2")}`);
    expect(text).toContain(`${isolateLtr("1")} of ${isolateLtr("2")}`);
    expect(text).toContain("1.5 KB / 2 KB");

    const buttons = [...(element.shadowRoot?.querySelectorAll(".sheet-btn") ?? [])];
    expect(buttons[0]?.getAttribute("title")).toBe("Clear completed");
    expect(buttons[1]?.getAttribute("title")).toBe("Collapse");

    const sheet = element.shadowRoot?.querySelector("cv-bottom-sheet");
    const queue = sheet?.querySelector("cv-operation-queue.sheet-queue");
    expect(queue).not.toBeNull();
    expect(queue?.querySelector(".tasks-container")).not.toBeNull();
    expect(queue?.querySelector(".sheet-footer")).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".footer-progress-label")).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".footer-count")).not.toBeNull();
    expect(element.shadowRoot?.querySelector('.sheet-status bdi[dir="ltr"]')?.textContent).toBe(
      "1.5 KB / 2 KB",
    );
    expect(element.shadowRoot?.querySelector('.footer-size bdi[dir="ltr"]')?.textContent).toBe(
      "1.5 KB / 2 KB",
    );
  });

  it("uses active batch stats in the expanded footer", async () => {
    const uploadTasks = atom<UploadTask[]>([]);

    const oldTask = new UploadTask({
      id: "old-task",
      name: "old.bin",
      total: 1_024,
      batchId: "old",
    });
    oldTask.markDone();
    const activeDone = new UploadTask({
      id: "active-done",
      name: "one.bin",
      total: 100,
      batchId: "active",
      batchIndex: 0,
      batchCount: 2,
    });
    activeDone.markDone();
    const activeQueued = new UploadTask({
      id: "active-queued",
      name: "two.bin",
      total: 300,
      batchId: "active",
      batchIndex: 1,
      batchCount: 2,
      initialStatus: "queued",
    });
    uploadTasks.set([oldTask, activeDone, activeQueued]);

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<"mobile" | "desktop">("mobile"),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats([activeDone, activeQueued]),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    );

    const model = new UploadProgressModel();
    model.expand();

    const element = document.createElement("upload-progress-mobile") as UploadProgressMobile;
    element.model = model;
    document.body.appendChild(element);
    await settle(element);

    const text = element.shadowRoot?.textContent ?? "";
    expect(text).toContain(`File transfers (${isolateLtr("3")})`);
    expect(text).toContain(`Uploading files: ${isolateLtr("2")}`);
    expect(text).toContain(`${isolateLtr("1")} of ${isolateLtr("2")}`);
    expect(text).toContain("100 B / 400 B");
  });

  it("renders failed transfer dock with danger tone and localized summary", async () => {
    const uploadTasks = atom<UploadTask[]>([]);

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<"mobile" | "desktop">("mobile"),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    );

    const task = new UploadTask({ id: "failed-task", name: "failed.bin", total: 1_024 });
    task.markError();
    uploadTasks.set([task]);

    const model = new UploadProgressModel();
    const element = document.createElement("upload-progress-mobile") as UploadProgressMobile;
    element.model = model;
    document.body.appendChild(element);
    await settle(element);

    expect(model.expanded()).toBe(true);
    expect(element.shadowRoot?.querySelector(".minimized-bar")).toBeNull();
    expect(element.shadowRoot?.querySelector(".sheet-title")?.getAttribute("data-tone")).toBe(
      "danger",
    );
    expect(element.shadowRoot?.textContent ?? "").toContain(
      `Needs attention: ${isolateLtr("1")} failed`,
    );
  });

  it("collapses the expanded bottom sheet through the transient back registry", async () => {
    const uploadTasks = atom<UploadTask[]>([]);

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<"mobile" | "desktop">("mobile"),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    );

    const task = new UploadTask({ id: "uploading-task", name: "archive.zip", total: 1_024 });
    task.setProgress(512);
    uploadTasks.set([task]);

    const model = new UploadProgressModel();
    model.expand();

    const element = document.createElement("upload-progress-mobile") as UploadProgressMobile;
    element.model = model;
    document.body.appendChild(element);
    await settle(element);

    expect(model.expanded()).toBe(true);
    expect(transientBackModel.consumeBack()).toBe(true);
    await settle(element);

    expect(model.expanded()).toBe(false);
  });

  it("collapses only when the bottom sheet reports open=false", async () => {
    const uploadTasks = atom<UploadTask[]>([]);

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<"mobile" | "desktop">("mobile"),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    );

    const task = new UploadTask({ id: "uploading-task", name: "archive.zip", total: 1_024 });
    task.setProgress(512);
    uploadTasks.set([task]);

    const model = new UploadProgressModel();
    model.expand();
    const element = document.createElement("upload-progress-mobile") as UploadProgressMobile;
    element.model = model;
    document.body.appendChild(element);
    await settle(element);

    const sheet = element.shadowRoot?.querySelector("cv-bottom-sheet") as HTMLElement | null;
    expect(sheet).not.toBeNull();

    sheet?.dispatchEvent(
      new CustomEvent("cv-change", { detail: { value: "task" }, bubbles: true, composed: true }),
    );
    await settle(element);
    expect(model.expanded()).toBe(true);

    sheet?.dispatchEvent(
      new CustomEvent("cv-change", { detail: { open: false }, bubbles: true, composed: true }),
    );
    await settle(element);
    expect(model.expanded()).toBe(false);
  });
});
