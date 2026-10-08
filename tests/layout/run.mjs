/******************************************************************************\

                  This file is part of the Folding@home Client.

          The fah-client runs Folding@home protein folding simulations.
                    Copyright (c) 2001-2026, foldingathome.org
                               All rights reserved.

       This program is free software; you can redistribute it and/or modify
       it under the terms of the GNU General Public License as published by
        the Free Software Foundation; either version 3 of the License, or
                       (at your option) any later version.

         This program is distributed in the hope that it will be useful,
          but WITHOUT ANY WARRANTY; without even the implied warranty of
          MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
                   GNU General Public License for more details.

     You should have received a copy of the GNU General Public License along
     with this program; if not, write to the Free Software Foundation, Inc.,
           51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

                  For information regarding this software email:
                                 Joseph Coffland
                          joseph@cauldrondevelopment.com

\******************************************************************************/

// Verify the production settings container and controls in Chromium.
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import {chromium} from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url))
const server = await createServer({root, server: {host: '127.0.0.1', port: 0}})
let browser
try {
  await server.listen()
  browser = await chromium.launch()
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => {errors.push(error.message); console.error(error.message)})
  // Keep font availability deterministic and avoid external services.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  for (const [viewport, panel] of [[320,320], [375,375], [768,500], [1440,500]]) {
    await page.setViewportSize({width: viewport, height: 1100})
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/layout/index.html`)
    await page.waitForFunction(() => window.layoutReady)
    // Exercise real Vue watcher/unmount ordering with production scroll utilities.
    await page.evaluate(async () => {
      const {createApp, h, nextTick} = await import('/node_modules/.vite/deps/vue.js')
      const {default: Help} = await import('/src/HelpBalloon.vue')
      const {default: Util} = await import('/src/util.js')
      const util = new Util()
      for (const scenario of ['active', 'inactive', 'closed', 'rapid-open', 'rapid-close']) {
        let unlocks = 0
        const host = document.createElement('div')
        document.body.appendChild(host)
        const app = createApp(Help, {name: 'Lifecycle test', iconOnly: true})
        app.component('Button', {render: () => h('button')})
        app.config.globalProperties.$util = {
          lock_scrolling: () => util.lock_scrolling(),
          unlock_scrolling: () => {++unlocks; util.unlock_scrolling()}
        }
        const help = app.mount(host)
        if (scenario !== 'inactive') {
          help.active = true
          if (scenario !== 'rapid-open') await nextTick()
        } else util.lock_scrolling()
        if (scenario === 'closed' || scenario === 'rapid-close') {
          help.active = false
          if (scenario === 'closed') await nextTick()
        }
        app.unmount()
        await nextTick()
        const expected = scenario === 'inactive' ? 0 : 1
        if (unlocks !== expected) throw new Error(`${scenario}: ${unlocks} unlocks`)
        if (document.body.style.position !== (scenario === 'inactive' ? 'fixed' : ''))
          throw new Error(`${scenario}: incorrect scroll restoration`)
        util.unlock_scrolling()
        host.remove()
      }
    })
    // External icon resources are blocked; keep the help target visible offline.
    await page.addStyleTag({content: ' .cpu-class-mode .fa-info-circle::before {content: "i"} .cpu-class-mode .fa-times::before {content: "x"}'})
    await page.locator('#app').evaluate((el, width) => {el.style.width = width + 'px'}, panel)
    const policyHelp = page.getByRole('button', {name: 'CPU allocation limits', exact: true})
    const classRadio = page.locator('.cpu-class-mode input[type="radio"]')
    const checkedBefore = await classRadio.isChecked()
    const helpBounds = await page.locator('.cpu-class-mode').evaluate(el => {
      const label = el.querySelector('label').getBoundingClientRect()
      const icon = el.querySelector('.help-name').getBoundingClientRect()
      const parent = el.getBoundingClientRect()
      return {labelRight:label.right, iconLeft:icon.left, iconRight:icon.right, parentRight:parent.right}
    })
    assert.ok(helpBounds.iconLeft >= helpBounds.labelRight - 1)
    assert.ok(helpBounds.iconRight <= helpBounds.parentRight + 1)
    assert.equal(await page.locator('.cpu-budget-note').filter({hasText: 'When performance classes'}).count(), 0)
    await policyHelp.click()
    const policyBalloon = page.locator('.cpu-class-mode .help-content')
    await policyBalloon.waitFor({state: 'visible'})
    assert.ok((await policyBalloon.innerText()).includes('Performance-class limits share'))
    assert.equal(await classRadio.isChecked(), checkedBefore)
    await page.locator('.cpu-class-mode .help-header .button').click()
    await policyBalloon.waitFor({state: 'detached'})
    await policyHelp.focus()
    await policyHelp.press('Enter')
    await policyBalloon.waitFor({state: 'visible'})
    assert.equal(await classRadio.isChecked(), checkedBefore)
    await page.locator('.cpu-class-mode .help-header .button').click()
    await policyBalloon.waitFor({state: 'detached'})
    const rows = await page.locator('.cpu-class').evaluateAll(elements => elements.map(el => {
      const rect = selector => {
        const r = el.querySelector(selector).getBoundingClientRect()
        return {left:r.left, right:r.right, top:r.top, bottom:r.bottom}
      }
      const p = el.getBoundingClientRect()
      return {label:rect('label'), slider:rect('input'), text:rect('span'), left:p.left, right:p.right}
    }))
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.ok(row.label.bottom <= row.slider.top + 1, `label overlaps slider at ${viewport}/${panel}`)
      assert.ok(row.slider.right <= row.text.left + 1, `slider overlaps count at ${viewport}/${panel}`)
      assert.ok(row.slider.left >= row.left - 1 && row.text.right <= row.right + 1,
        `controls overflow class row at ${viewport}/${panel}`)
    }
    for (const mode of ['classes', 'count', 'gpu']) {
      await page.evaluate(mode => window.setLayoutMode(mode), mode)
      const bounds = await page.locator('.settings-view.page-view').evaluate(el => {
        const r = el.getBoundingClientRect()
        return {width: r.width, scroll: el.scrollWidth}
      })
      assert.ok(bounds.scroll <= bounds.width + 1, `settings page overflows in ${mode} at ${viewport}/${panel}`)
      const selector = mode === 'gpu' ? '.gpu-reservation-control input' :
        mode === 'count' ? '.cpu-count-row input' : '.cpu-class input'
      const controls = await page.locator(selector).evaluateAll(elements => elements.map(el => {
        const slider = el.getBoundingClientRect()
        const parent = el.parentElement.getBoundingClientRect()
        return {left: slider.left, right: slider.right, parentLeft: parent.left, parentRight: parent.right}
      }))
      assert.ok(controls.length > 0, `missing ${mode} controls`)
      for (const control of controls)
        assert.ok(control.left >= control.parentLeft - 1 && control.right <= control.parentRight + 1,
          `${mode} slider overflows at ${viewport}/${panel}`)
    }
    const priority = page.locator('.gpu-priority select')
    assert.equal(await priority.count(),1)
    await priority.selectOption('other-normal')
    assert.equal(await priority.inputValue(),'other-normal')
    const rect = await priority.evaluate(el => ({width:el.getBoundingClientRect().width, parent:el.parentElement.getBoundingClientRect().width}))
    assert.ok(rect.width <= rect.parent + 1, 'GPU priority dropdown overflows')
    await page.locator('.gpu-priority .button').click()
    assert.equal(await priority.inputValue(),'')
    await page.evaluate(() => window.setZeroCapacityDraft())
    assert.deepEqual(await page.evaluate(() => window.zeroCapacityState()),
      {cpus:4, reserved:7, limit:0, valid:false})
    const recovery = page.locator('.cpu-zero-action .button')
    await recovery.waitFor({state:'visible'})
    const recoveryBounds = await recovery.evaluate(el => {
      const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect()
      return {left:r.left, right:r.right, parentLeft:p.left, parentRight:p.right}
    })
    assert.ok(recoveryBounds.left >= recoveryBounds.parentLeft - 1 &&
      recoveryBounds.right <= recoveryBounds.parentRight + 1, 'zero-capacity action overflows')
    await recovery.click()
    assert.deepEqual(await page.evaluate(() => window.zeroCapacityState()),
      {cpus:0, reserved:7, limit:0, valid:true})
    await recovery.waitFor({state:'detached'})
    console.log(`PASS: settings page, class/General sliders and GPU reservation at viewport ${viewport}, panel ${panel}`)
  }
  // Render the production details view with the authoritative Unit adapter.
  await page.evaluate(async () => {
    const {createApp, reactive, nextTick} = await import('/node_modules/.vite/deps/vue.js')
    const {default: Details} = await import('/src/UnitDetailsView.vue')
    const {default: Unit} = await import('/src/unit.js')
    const {default: Util} = await import('/src/util.js')
    const message='Scheduler "denied" & <img src=x onerror=alert(1)>'
    const data=reactive({id:'test',number:1,state:'RUN',group:'',gpus:[],
      assignment:{project:1},wu:{run:1,clone:2,gen:3},
      affinity_warning:'Affinity',gpu_priority_warning:'Priority',
      launch_environment_warning:message,gpu_priority_requested:'other-normal'})
    const unit=new Unit({$util:Util.prototype},data,
      {get_warnings:()=>[],get_config:()=>({})})
    const host=document.createElement('div')
    document.body.appendChild(host)
    const app=createApp(Details,{unitID:'test'})
    for(const name of ['ViewHeader','unit-info','ProjectView'])
      app.component(name,{render:()=>null})
    app.config.globalProperties.$machs={get_unit:()=>unit}
    app.config.globalProperties.$projects={get:()=>({})}
    app.config.globalProperties.$api={fetch:async()=>[]}
    app.mount(host)
    await nextTick()
    const alerts=()=>Array.from(host.querySelectorAll('[role="alert"]'),el=>el.textContent.trim())
    const check=expected=> {
      if(JSON.stringify(alerts())!==JSON.stringify(expected))throw new Error('Incorrect details alerts')
    }
    check(['Affinity','Priority',message])
    if(host.querySelector('[role="alert"] img'))throw new Error('Warning text interpreted as HTML')
    if(!host.textContent.includes('Requested GPU CPU priority: other-normal'))
      throw new Error('Requested priority mislabeled')
    for(const icon of host.querySelectorAll('[role="alert"] i'))
      if(icon.getAttribute('aria-hidden')!=='true')throw new Error('Decorative icon exposed')
    data.affinity_warning='Same';data.gpu_priority_warning='Same'
    await nextTick();check(['Same','Same',message])
    delete data.launch_environment_warning
    await nextTick();check(['Same','Same'])
    data.affinity_warning='';data.gpu_priority_warning='';data.gpu_priority_requested=''
    await nextTick();check([])
    if(host.textContent.includes('Requested GPU CPU priority:'))throw new Error('Cleared priority still shown')
    app.unmount();host.remove()
  })
  console.log('PASS: details warning order, duplicates, selective removal, text escaping and requested priority')
  assert.deepEqual(errors, [])
} finally {
  await browser?.close()
  await server.close()
}
