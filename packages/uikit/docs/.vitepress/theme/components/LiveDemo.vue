<script setup lang="ts">
import {ref, onMounted, computed} from 'vue'

const props = defineProps<{
  code: string
  highlighted: string
}>()

const container = ref<HTMLElement | null>(null)
const hasScript = ref(false)

const decoded = computed(() => atob(props.code))
const highlightedHtml = computed(() => atob(props.highlighted))

onMounted(() => {
  if (!container.value) return
  const raw = decoded.value
  hasScript.value = /<script[\s>]/i.test(raw)
  const html = raw.replace(/<script[\s\S]*?<\/script>/gi, '')
  container.value.innerHTML = html
})
</script>

<template>
  <div class="live-demo-wrapper">
    <div ref="container" class="live-demo-preview" />
    <p v-if="hasScript" class="live-demo-script-note">
      This example includes script logic that must run in a real document.
    </p>
    <details class="live-demo-source">
      <summary>View source</summary>
      <div v-html="highlightedHtml" />
    </details>
  </div>
</template>
