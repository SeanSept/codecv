import { onActivated, Ref, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getLocalStorage } from '@/common/localstorage'
import { errorMessage, successMessage, warningMessage } from '@/common/message'
import { importCSS, isDev, useLoading } from '@/utils'
import { splitPage } from './components/tabbar/hook'
import useEditorStore from '@/store/modules/editor'
import { convertDOM } from '@/utils/moduleCombine'
import { resumeExport } from '@/api/modules/resume'
import {
  CUSTOM_CSS_STYLE,
  CUSTOM_MARKDOWN_PRIMARY_COLOR,
  CUSTOM_MARKDOWN_PRIMARY_BG_COLOR,
  MARKDOWN_FONT,
  ADJUST_RESUME_MARGIN_TOP,
  AUTO_ONE_PAGE
} from './components/tabbar/hook'

export const get = getLocalStorage,
  styleAttrs = [
    CUSTOM_CSS_STYLE,
    CUSTOM_MARKDOWN_PRIMARY_COLOR,
    CUSTOM_MARKDOWN_PRIMARY_BG_COLOR,
    MARKDOWN_FONT,
    ADJUST_RESUME_MARGIN_TOP,
    AUTO_ONE_PAGE
  ]

export function useRenderHTML(resumeType: Ref<string>) {
  const renderDOM = ref<HTMLElement>(document.body)
  const editorStore = useEditorStore()

  onActivated(() => {
    importCSS(resumeType.value)
    renderDOM.value.innerHTML = convertDOM(editorStore.MDContent).innerHTML
    setTimeout(() => splitPage(renderDOM.value), 100)
  })

  watch(
    () => editorStore.MDContent,
    v => {
      renderDOM.value.innerHTML = convertDOM(v).innerHTML
      setTimeout(() => splitPage(renderDOM.value), 50)
    }
  )
  // 刷新页面（这里是一个比较有问题的点）
  watch(
    () => resumeType.value,
    () => {
      location.reload()
    }
  )
  return {
    renderDOM,
    editorStore
  }
}

export function useResumeType() {
  const route = useRoute()
  //初始化也需要填上值 否则后续更新不一致会导致刷新死循环
  const resumeType = ref(route.query.type ? String(route.query.type) : '10front_end')
  onActivated(() => {
    resumeType.value = route.query.type ? String(route.query.type) : '10front_end'
  })
  return {
    resumeType
  }
}
// 导出简历｜markdown内容
export function useDownLoad(type: Ref<string>) {
  const router = useRouter(),
    editorStore = useEditorStore(),
    { showLoading, closeLoading } = useLoading()

  const downloadDynamic = async (fileName: string) => {
    const html = document.querySelector('.jufe') as HTMLElement
    const resumeBgColor = `html,body { background: ${getComputedStyle(html).getPropertyValue(
      'background'
    )}; }`
    const resetStyle = ` * { margin: 0; padding: 0; box-sizing: border-box; }`
    // 获取简历模板的样式
    let style = '',
      linkURL = 'none'
    if (isDev()) {
      // 生产环境使用动态导入 生产环境使用link的方式引入（解决生产default属性不暴露的问题）
      style = await importCSS(type.value)
    } else {
      const linkStyle = document.querySelector('link[href*="/css/style"]') as HTMLLinkElement
      linkURL = linkStyle?.href || 'none'
    }
    // 处理自定义生成的样式
    for (const attr of styleAttrs) {
      const styleContent = document.head.querySelector(`style[${attr}-${type.value}]`)?.textContent
      if (!styleContent) continue
      style = styleContent + '\n' + style
    }
    style = resumeBgColor + '\n' + resetStyle + '\n' + style
    showLoading('因使用国外服务速度稍慢 请耐心等待...')
    try {
      const pdfData = await resumeExport({ content: html.outerHTML, style, link: linkURL })
      const blob = new Blob([new Uint8Array(pdfData.pdf.data)], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      successMessage('导出成功～')
    } catch (e: any) {
      const errorMsg =
        e.message == 'Failed to fetch'
          ? '国内导出易出错 请重新尝试 有条件的打开梯子后重试或使用打印机导出'
          : '导出出错 请先尝试其他方式'
      errorMessage(errorMsg)
    }
    closeLoading()
  }

  const downloadNative = () => {
    localStorage.setItem('download', JSON.stringify(convertDOM(editorStore.MDContent).innerHTML))
    router.push({ path: '/download', query: { type: type.value } })
  }

  const downloadMD = () => {
    const blob = new Blob([editorStore.MDContent])
    const url = URL.createObjectURL(blob)
    const aTag = document.createElement('a')
    aTag.download = document.title + '.md'
    aTag.href = url
    aTag.click()
    URL.revokeObjectURL(url)
    successMessage('导出成功~')
  }
  return {
    downloadMD,
    downloadDynamic,
    downloadNative
  }
}

export function useImportMD(resumeType: string) {
  function importMD(file: File) {
    const { writable } = useEditorStore()
    if (writable) {
      return warningMessage('请先切换到Markdown模式')
    }
    const reader = new FileReader(),
      { setMDContent } = useEditorStore()
    reader.readAsText(file, 'utf-8')
    reader.onload = function (event) {
      successMessage('导入成功~')
      setMDContent((event.target?.result as string) || '', resumeType)
    }
    reader.onerror = function () {
      errorMessage('导入失败!')
    }
  }
  return {
    importMD
  }
}

export function useAvatar(resumeType: string) {
  const matchAvatarSlot = /!\[个人头像\]\(.*\)/
  function setAvatar(path: string) {
    const { MDContent, setMDContent } = useEditorStore()
    if (!matchAvatarSlot.test(MDContent)) {
      warningMessage('上传前请确保你想上传的位置在编辑器中存在 ![个人头像](...) 此关键字')
      return
    }
    const newContent = MDContent.replace(matchAvatarSlot, `![个人头像](${path})`)
    setMDContent(newContent, resumeType)
    successMessage('头像上传成功，如果你想修改为网络图片，你可直接修改对应的链接！')
    // 可能还需要处理可编辑模式中的头像
    const writableDOM = document.querySelector('.writable-edit-mode')
    if (writableDOM) {
      const avatar: HTMLImageElement | null = writableDOM.querySelector('img[alt*=个人头像]')
      avatar && (avatar.src = path)
    }
  }
  return {
    setAvatar
  }
}

export const clickedTarget = ref<HTMLElement | null>()

export function ensureResetClickedTarget() {
  clickedTarget.value = null
}
