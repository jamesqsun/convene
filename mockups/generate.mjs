// Generates the ten static mockups plus an index. Run: node mockups/generate.mjs
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = path.dirname(fileURLToPath(import.meta.url))

const sources = [
  [
    'Terracotta palette guide: the 60/25/15 rule and "warm whites let it sing"',
    'https://colorpaletteguide.com/terracotta-color-palette/',
  ],
  [
    'Peach palettes: peach + cream and peach + sage hex sets',
    'https://creativebooster.net/blogs/colors/peach-color-palettes',
  ],
  [
    'Sage green base #9CAF88 and its warm-neutral pairings',
    'https://macaronsandmimosas.com/green-with-envy-15-sage-palettes/',
  ],
  [
    '2026 mobile app colour trends: warm neutrals and nature-inspired bases',
    'https://elements.envato.com/learn/color-scheme-trends-in-mobile-app-design',
  ],
  [
    'Cute and cozy fonts: rounded, low-contrast letterforms for warmth',
    'https://elements.envato.com/learn/cute-and-cozy-font-trend',
  ],
  [
    'UI colour trends 2026: elevated warm neutrals with grounded accents',
    'https://updivision.com/blog/post/ui-color-trends-to-watch-in-2026',
  ],
]

// Each palette: page (behind the frames), bg, surface, ink, muted, line, primary, onPrimary, accent, soft.
const mockups = [
  {
    slug: '01-welcome',
    title: 'Welcome and sign in',
    nav: null,
    palette: {
      name: 'Peach & Cream',
      bg: '#FFF8F1',
      surface: '#FFFFFF',
      ink: '#3D2B1F',
      muted: '#8C7B70',
      line: '#F1E3D6',
      primary: '#E07A5F',
      onPrimary: '#FFFFFF',
      accent: '#FFCBA4',
      soft: '#FFE9D9',
    },
    inspiration:
      'Peach and cream from the creativebooster peach palettes, with a sun-baked coral as the single strong colour. Rounded serif headings for a handwritten-invitation feel.',
    screen: welcome,
  },
  {
    slug: '02-onboarding-interests',
    title: 'Onboarding: interests',
    nav: null,
    palette: {
      name: 'Terracotta & Sage',
      bg: '#F5EFE6',
      surface: '#FFFCF7',
      ink: '#2B2320',
      muted: '#7C6F66',
      line: '#E8DED2',
      primary: '#C56A4D',
      onPrimary: '#FFFCF7',
      accent: '#9CAF88',
      soft: '#F3E2D8',
    },
    inspiration:
      "The terracotta guide's 60/25/15 rule: cream carries the layout, clay terracotta anchors the action, sage is the counterpoint on selected chips.",
    screen: interests,
  },
  {
    slug: '03-onboarding-answers',
    title: 'Onboarding: written answers',
    nav: null,
    palette: {
      name: 'Honey & Olive',
      bg: '#FBF6EA',
      surface: '#FFFDF7',
      ink: '#2F2A1E',
      muted: '#7E7562',
      line: '#EDE4CF',
      primary: '#C99A2E',
      onPrimary: '#2F2A1E',
      accent: '#6B7B4B',
      soft: '#F6ECCF',
    },
    inspiration:
      'Honey on parchment, the palette of a notebook. Olive keeps the privacy note calm rather than alarming.',
    screen: answers,
  },
  {
    slug: '04-availability',
    title: 'Availability',
    nav: 'Availability',
    palette: {
      name: 'Sage & Linen',
      bg: '#F4F1EA',
      surface: '#FFFFFF',
      ink: '#2E332A',
      muted: '#75796E',
      line: '#E3E0D6',
      primary: '#6F8C5E',
      onPrimary: '#FFFFFF',
      accent: '#E2725B',
      soft: '#E7EEDF',
    },
    inspiration:
      'Sage (#9CAF88 family, deepened for contrast) on linen. Terracotta appears only on the one state that needs attention.',
    screen: availability,
  },
  {
    slug: '05-plans',
    title: 'Plans and the assignment banner',
    nav: 'Plans',
    palette: {
      name: 'Apricot & Clay',
      bg: '#FFF4E8',
      surface: '#FFFFFF',
      ink: '#3B2A22',
      muted: '#8A756A',
      line: '#F3E1D2',
      primary: '#D9774F',
      onPrimary: '#FFFFFF',
      accent: '#F4A261',
      soft: '#FFE6D2',
    },
    inspiration:
      'Apricot for the good news banner, clay for actions: the "solar warmth" direction in the 2026 trend reports, kept muted.',
    screen: plans,
  },
  {
    slug: '06-plan-detail',
    title: 'Plan detail',
    nav: 'Plans',
    palette: {
      name: 'Butter & Cocoa',
      bg: '#FFF9E6',
      surface: '#FFFFFF',
      ink: '#3A2A20',
      muted: '#85705F',
      line: '#F2E8CB',
      primary: '#5C3D2E',
      onPrimary: '#FFF9E6',
      accent: '#F6D776',
      soft: '#FBF0C9',
    },
    inspiration:
      'Cocoa text and buttons on butter: high contrast without a single cold grey, so phone numbers and venue facts read easily outdoors.',
    screen: planDetail,
  },
  {
    slug: '07-hangouts-feedback',
    title: 'Hangouts: meet again?',
    nav: 'Hangouts',
    palette: {
      name: 'Rose & Oat',
      bg: '#FAF3EE',
      surface: '#FFFFFF',
      ink: '#3B2B2B',
      muted: '#8A7373',
      line: '#F0E1DA',
      primary: '#B85C5C',
      onPrimary: '#FFFFFF',
      accent: '#F2C4B3',
      soft: '#FBE4DC',
    },
    inspiration:
      'Dusty rose on oat, from the terracotta + soft pink + cream combination. Gentle enough for a question about people.',
    screen: hangouts,
  },
  {
    slug: '08-graph',
    title: 'Your connections',
    nav: 'Graph',
    palette: {
      name: 'Moss & Parchment',
      bg: '#F5F0E1',
      surface: '#FFFDF6',
      ink: '#2C332E',
      muted: '#6F776F',
      line: '#E5DFCB',
      primary: '#4F6D5A',
      onPrimary: '#F5F0E1',
      accent: '#C9B98A',
      soft: '#E4E9DC',
    },
    inspiration:
      "Moss (Hooker's green from the peach + sage set) on parchment. Friend lines are solid moss; fading acquaintances are dashed and lighter.",
    screen: graph,
  },
  {
    slug: '09-profile-memories',
    title: 'Profile: what Convene remembers',
    nav: 'Profile',
    palette: {
      name: 'Caramel & Ivory',
      bg: '#FBF7F0',
      surface: '#FFFFFF',
      ink: '#3D2E22',
      muted: '#8B7A6B',
      line: '#EFE4D6',
      primary: '#B77B4A',
      onPrimary: '#FFFFFF',
      accent: '#E8D3B5',
      soft: '#F7EBDB',
    },
    inspiration:
      'Caramel and ivory, the warm-neutral "new neutrals" direction. Memory cards look like index cards; the editor is the same card opened up.',
    screen: profile,
  },
  {
    slug: '10-push-moment',
    title: 'The push moment',
    nav: 'Availability',
    palette: {
      name: 'Coral & Cream',
      bg: '#FFF6F0',
      surface: '#FFFFFF',
      ink: '#3A2A2E',
      muted: '#8B7378',
      line: '#F4E2DC',
      primary: '#E86F5A',
      onPrimary: '#FFFFFF',
      accent: '#5A3E4B',
      soft: '#FFE3DB',
    },
    inspiration:
      'Coral from the coral-peach set, grounded by plum. The notification is the only saturated element on the screen.',
    screen: pushMoment,
  },
]

const navItems = ['Availability', 'Plans', 'Hangouts', 'Graph', 'Profile']

function navLinks(active) {
  return navItems
    .map((item) => `<a class="${item === active ? 'active' : ''}" href="#">${item}</a>`)
    .join('')
}

// Sidebar first (desktop), then content, then the bottom nav (phone) so it sits below the content.
function shell(active, content) {
  const sidebar = `<aside class="sidebar"><div class="brand"><span class="mark"></span>Convene</div><nav>${navLinks(active)}</nav><p class="side-note">You give Convene time.<br>Convene turns it into plans.</p></aside>`
  return `<div class="app">${sidebar}<main class="content">${content}</main><nav class="bottom-nav">${navLinks(active)}</nav></div>`
}

function welcome() {
  return `<div class="app welcome"><section class="hero"><div class="sun"></div><div class="hill hill-a"></div><div class="hill hill-b"></div><div class="hero-text"><span class="mark big"></span><h1>Convene</h1><p>You give Convene time.<br>Convene turns it into plans.</p></div></section>
<section class="hero-form"><h2>Sign in</h2>
<label>Email<input value="maya@convene.demo"></label>
<label>Password<input type="password" value="••••••••"></label>
<button class="btn primary">Sign in</button>
<div class="personas"><p class="eyebrow">Demo personas</p><p class="hint">Fictional people. Tap one to explore as them.</p><div class="chips"><span class="chip">Maya · Toronto</span><span class="chip">Ben · Toronto</span><span class="chip">Chloe · Toronto</span><span class="chip">Jun · Vancouver</span><span class="chip">Lena · Vancouver</span></div></div>
<p class="hint">New here? <a href="#">Create an account</a></p></section></div>`
}

function stepper(current) {
  const steps = ['Basics', 'City', 'Phone', 'Interests', 'Answers']
  return `<ol class="stepper">${steps.map((step, i) => `<li class="${i < current ? 'done' : i === current ? 'now' : ''}"><span>${i + 1}</span>${step}</li>`).join('')}</ol>`
}

function interests() {
  const all = [
    'coffee',
    'food',
    'cooking',
    'hiking',
    'running',
    'climbing',
    'yoga',
    'board games',
    'trivia',
    'music',
    'live music',
    'art',
    'museums',
    'photography',
    'film',
    'books',
    'writing',
    'theatre',
    'dance',
    'crafts',
    'pottery',
    'markets',
    'travel',
    'languages',
    'tech',
    'volunteering',
    'dogs',
    'nature',
    'sports',
    'comedy',
  ]
  const selected = new Set(['coffee', 'hiking', 'books', 'photography'])
  return `<div class="app onboarding">${stepper(3)}<main class="content narrow"><p class="eyebrow">Step 4 of 5</p><h1>What are you into?</h1><p class="lede">Pick up to 10. These are the only details other participants see.</p>
<div class="chips wrap">${all.map((i) => `<span class="chip ${selected.has(i) ? 'on' : ''}">${i}</span>`).join('')}</div>
<p class="hint">4 selected</p><button class="btn primary wide">Continue</button></main></div>`
}

function answers() {
  return `<div class="app onboarding">${stepper(4)}<main class="content narrow"><p class="eyebrow">Step 5 of 5</p><h1>A few questions</h1><p class="lede">A few sentences each. Only you can read these; Convene turns them into memories it uses to plan.</p>
<label>What does a good weekend look like for you?<textarea rows="3">A slow start with a long walk somewhere green, then coffee in a place quiet enough to read for an hour.</textarea></label>
<label>How do you like to meet new people, and what makes it feel comfortable?<textarea rows="3">Small groups where there is something to do with our hands, so conversation can come and go without pressure.</textarea></label>
<label>What is something you would like to try with the right company?<textarea rows="3">A beginner bouldering session, as long as nobody expects me to be any good at it on the first try.</textarea></label>
<button class="btn primary wide">Finish</button></main>
<aside class="side-card"><p class="eyebrow">What happens next</p><h3>Your memory sketch</h3><p>Convene turns these answers into a handful of memories, each with a title, a summary, and a few attributes. Every memory quotes your own words as evidence.</p><p>You can edit any field or delete a memory from your profile. Raw answers never appear in plans.</p><div class="mini-memory"><strong>quiet cafes</strong><span>Prefers unhurried cafe time over busy venues.</span><em>setting: quiet · pace: unhurried</em></div></aside></div>`
}

function slot(range, state, extra = '') {
  const cls = {
    waiting: 'amber',
    'catch-up': 'amber',
    assigned: 'green',
    unfilled: 'grey',
    paused: 'grey',
  }[state]
  const label = {
    waiting: 'Waiting for its planning batch',
    'catch-up': 'Checked hourly for a late match',
    assigned: 'Plan assigned',
    unfilled: 'No plan was found',
    paused: 'Paused',
  }[state]
  const actions =
    state === 'assigned'
      ? '<a href="#" class="link">See the plan</a>'
      : state === 'unfilled'
        ? ''
        : `<div class="row-links"><a href="#">Edit</a><a href="#">${state === 'paused' ? 'Reopen' : 'Pause'}</a><a href="#" class="danger">Remove</a></div>`
  return `<article class="card"><p class="strong">${range}</p><span class="pill ${cls}">${label}</span>${extra}${actions}</article>`
}

function availability() {
  return shell(
    'Availability',
    `<h1>Availability</h1><p class="lede">Tell Convene when you are free. It picks the people, activity, place, and exact time.</p>
<div class="two-col">
<div class="stack">
${slot('Saturday, October 3, 6:00 PM to 9:00 PM', 'assigned')}
${slot('Sunday, October 4, 10:00 AM to 1:00 PM', 'waiting', '<p class="hint">Planning runs Fri, Oct 2, 12:00 AM.</p>')}
${slot('Wednesday, October 7, 6:30 PM to 9:00 PM', 'catch-up')}
${slot('Thursday, October 8, 7:00 PM to 10:00 PM', 'paused')}
${slot('Tuesday, September 29, 6:00 PM to 8:00 PM', 'unfilled')}
</div>
<div class="stack sticky"><form class="card form"><p class="strong">Add availability <span class="muted">(America/Toronto)</span></p><label>Date<input type="date" value="2026-10-10"></label><div class="row"><label>From<input type="time" value="18:00"></label><label>Until<input type="time" value="21:00"></label></div><p class="hint">At least one hour. Plans are made at midnight two days ahead, so windows must end more than 49 hours from now.</p><button class="btn primary">Add</button></form><button class="btn ghost">Run planning now (demo)</button></div>
</div>`,
  )
}

function planCard(name, when, venue, people, cancelled = false) {
  return `<a href="#" class="card plan"><p class="strong">${name}</p><p>${when} · ${venue}</p><p class="hint">${cancelled ? 'Cancelled' : `${people} people`}</p></a>`
}

function plans() {
  return shell(
    'Plans',
    `<div class="banner"><span>New plan assigned. <a href="#">See the details</a></span><button aria-label="Dismiss">×</button></div><h1>Plans</h1>
<div class="two-col">
${planCard('Coffee and conversation', 'Sat, Oct 3, 6:00 PM', '(Demo) Coffee shop on Main', 4)}
${planCard('Walk in the park', 'Sun, Oct 4, 10:15 AM', '(Demo) Park Corner', 3)}
${planCard('Board game cafe', 'Wed, Oct 7, 7:00 PM', '(Demo) Board game cafe on Main', 5)}
${planCard('Pub trivia', 'Thu, Oct 1, 8:00 PM', '(Demo) Pub trivia night Corner', 2, true)}
</div>`,
  )
}

function person(name, interests, phone) {
  return `<li class="card person"><p class="strong">${name}</p><p class="hint">${interests}</p>${phone ? `<a href="#" class="link">${phone}</a>` : ''}</li>`
}

function planDetail() {
  return shell(
    'Plans',
    `<header><p class="eyebrow">Saturday</p><h1>Coffee and conversation</h1><p>Saturday, October 3, 6:00 PM to 7:00 PM EDT</p></header>
<p class="lede">You share an interest in coffee and books, so we picked coffee and conversation.</p>
<div class="two-col">
<div class="stack"><section><p class="eyebrow">Where</p><p class="strong">(Demo) Coffee shop on Main</p><p>12 Main St, Toronto (fictional)</p><div class="chips"><span class="pill amber">Fictional demo venue</span><span class="pill grey">Hours unverified</span><a href="#" class="link">Open in Maps</a></div></section>
<button class="btn outline danger wide">Withdraw from this plan</button><p class="hint">The others keep the plan if at least two remain. Your availability for it closes.</p></div>
<section><p class="eyebrow">Who</p><ul class="stack">${person('Ben Castellano', 'coffee · board games · trivia', '+1 416 555 0102')}${person('Chloe Nguyen', 'art · museums · coffee', '+1 416 555 0103')}${person('Grace Whitfield', 'museums · history · books', '+1 416 555 0107')}</ul></section>
</div>`,
  )
}

function feedbackRow(name, state) {
  const right =
    state === 'open'
      ? '<div class="row-btns"><button class="btn primary sm">Yes</button><button class="btn outline sm">No</button></div>'
      : `<p class="hint">You answered ${state}</p>`
  return `<li class="card person split"><div><p class="strong">${name}</p>${state === 'yes' ? '<span class="pill green">Mutual friends</span>' : ''}</div>${right}</li>`
}

function hangouts() {
  return shell(
    'Hangouts',
    `<h1>Past hangouts</h1><p class="lede">For each person: would you want to meet them again? Answers are private and final. When two people both say yes, they become friends.</p>
<div class="two-col">
<article class="card"><p class="strong">Board game cafe</p><p class="hint">Sun, Sep 6, 8:00 PM · (Demo) Board game cafe on Main</p><ul class="stack">${feedbackRow('Ben Castellano', 'yes')}${feedbackRow('Chloe Nguyen', 'no')}</ul></article>
<article class="card"><p class="strong">Walk in the park</p><p class="hint">Wed, Aug 12, 8:00 PM · (Demo) Park on Main</p><ul class="stack">${feedbackRow('Dev Raman', 'yes')}${feedbackRow('Elena Marsh', 'open')}</ul></article>
</div>`,
  )
}

function graphSvg() {
  const nodes = [
    { name: 'Ben', friend: true, days: 20 },
    { name: 'Dev', friend: true, days: 45 },
    { name: 'Chloe', friend: false, days: 20 },
    { name: 'Grace', friend: false, days: 88 },
    { name: 'Elena', friend: false, days: 140 },
  ]
  const cx = 160,
    cy = 160,
    r = 118
  const parts = nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / nodes.length
    const x = (cx + r * Math.cos(angle)).toFixed(1),
      y = (cy + r * Math.sin(angle)).toFixed(1)
    const opacity = Math.max(0.25, 1 - node.days / 90).toFixed(2)
    return (
      `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${node.friend ? 'var(--primary)' : 'var(--muted)'}" stroke-width="${node.friend ? 3 : 1.5}" ${node.friend ? '' : 'stroke-dasharray="4 4"'} stroke-opacity="${opacity}"/>` +
      `<circle cx="${x}" cy="${y}" r="15" fill="${node.friend ? 'var(--soft)' : 'var(--surface)'}" stroke="${node.friend ? 'var(--primary)' : 'var(--line)'}" stroke-width="2"/>` +
      `<text x="${x}" y="${Number(y) + 30}" text-anchor="middle" font-size="11" fill="var(--ink)">${node.name}</text><text x="${x}" y="${Number(y) + 42}" text-anchor="middle" font-size="9" fill="var(--muted)">${node.days} days ago</text>`
    )
  })
  return `<svg viewBox="0 0 320 320" class="graph">${parts.join('')}<circle cx="${cx}" cy="${cy}" r="20" fill="var(--ink)"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" fill="var(--bg)">You</text></svg>`
}

function graph() {
  return shell(
    'Graph',
    `<h1>Your connections</h1><p class="lede">People from completed Convene hangouts. Solid lines are mutual friends. Lines fade with time since your last Convene hangout together; they never disappear.</p>
<div class="two-col"><div class="card center">${graphSvg()}</div>
<ul class="stack"><li class="card person split"><div><p class="strong">Ben Castellano</p><span class="pill green">Mutual friends</span></div><p class="hint">2 hangouts · 20 days ago</p></li><li class="card person split"><div><p class="strong">Dev Raman</p><span class="pill green">Mutual friends</span></div><p class="hint">1 hangout · 45 days ago</p></li><li class="card person split"><div><p class="strong">Chloe Nguyen</p></div><p class="hint">1 hangout · 20 days ago</p></li><li class="card person split"><div><p class="strong">Grace Whitfield</p></div><p class="hint">1 hangout · 88 days ago</p></li></ul></div>`,
  )
}

function memory(title, summary, attrs) {
  return `<article class="card"><div class="split"><p class="strong">${title}</p><span class="hint">Edited by you</span></div><p>${summary}</p><div class="chips">${attrs.map((a) => `<span class="pill soft">${a}</span>`).join('')}</div><div class="row-links"><a href="#">Edit</a><a href="#" class="danger">Delete</a></div></article>`
}

function profile() {
  return shell(
    'Profile',
    `<header><h1>Maya Okafor</h1><p class="hint">Toronto</p></header><div class="row-links"><a href="#">Your answers and regeneration</a><a href="#">Sign out</a></div><h2>What Convene remembers</h2>
<div class="two-col">
${memory('quiet cafes', 'Prefers unhurried cafe time and reading over busy venues.', ['setting: quiet', 'pace: unhurried'])}
<form class="card form editing"><label>Title<input value="small groups"></label><label>Summary<textarea rows="2">Most comfortable in small groups with a shared activity.</textarea></label><p class="eyebrow">Attributes</p><div class="row"><input value="group_comfort"><input value="small groups"><button class="x">×</button></div><div class="row"><input value="social_style"><input value="activity first"><button class="x">×</button></div><a href="#" class="link">Add attribute</a><div class="row-btns"><button class="btn primary sm">Save</button><button class="btn outline sm">Cancel</button></div></form>
${memory('bouldering', 'Open to beginner bouldering with low expectations.', ['experience_level: beginner', 'intensity: low'])}
</div>`,
  )
}

function pushMoment() {
  return (
    `<div class="os-toast"><span class="mark"></span><div><strong>Convene</strong><p>Plan assigned: Coffee and conversation</p><p class="hint">Sat, Oct 3, 6:00 PM at (Demo) Coffee shop on Main</p></div><span class="hint">now</span></div>` +
    shell(
      'Availability',
      `<div class="banner dark"><span>Get a notification when a plan is assigned.</span><span class="row-btns"><button class="btn light sm">Enable</button><button class="btn text sm">Later</button></span></div><h1>Availability</h1><p class="lede">Tell Convene when you are free. It picks the people, activity, place, and exact time.</p>
<div class="two-col"><div class="stack">${slot('Saturday, October 3, 6:00 PM to 9:00 PM', 'assigned')}${slot('Sunday, October 4, 10:00 AM to 1:00 PM', 'waiting', '<p class="hint">Planning runs Fri, Oct 2, 12:00 AM.</p>')}</div>
<div class="card"><p class="eyebrow">Why push?</p><p>Plans are assigned at least 48 hours ahead. The push is a courtesy: your plan is already waiting in the app, whether or not the notification arrives.</p></div></div>`,
    )
  )
}

const css = `
*{box-sizing:border-box} html{scroll-behavior:smooth}
body{margin:0;font-family:'Nunito',system-ui,sans-serif;background:var(--page);color:var(--ink);line-height:1.45}
h1,h2,h3,.brand{font-family:'Fraunces',Georgia,serif;font-weight:600;letter-spacing:-.01em}
.page-head{max-width:1400px;margin:0 auto;padding:28px 24px 8px}
.page-head .crumbs{display:flex;gap:14px;flex-wrap:wrap;font-size:14px;margin-bottom:6px}.page-head .crumbs a{color:var(--ink)}
.page-head h1{font-size:30px;margin:0 0 6px}.page-head p{margin:4px 0;max-width:820px;color:var(--ink)}
.swatches{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 4px}.swatch{display:flex;align-items:center;gap:8px;font-size:12px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:4px 10px 4px 4px}.swatch i{width:22px;height:22px;border-radius:50%;border:1px solid rgba(0,0,0,.08)}
.stage{max-width:1400px;margin:0 auto;padding:20px 24px 60px;display:flex;gap:36px;flex-wrap:wrap;align-items:flex-start}
.label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.phone{width:390px;height:844px;border-radius:52px;border:12px solid #1c1917;background:#1c1917;position:relative;box-shadow:0 30px 60px rgba(60,40,20,.25);overflow:hidden;flex:none}
.phone::before{content:'';position:absolute;top:10px;left:50%;transform:translateX(-50%);width:110px;height:30px;background:#1c1917;border-radius:20px;z-index:5}
.phone .frame-inner{border-radius:40px}
.desktop-wrap{width:calc(1280px * .7);height:calc(860px * .7);flex:none}
.desktop{position:relative;width:1280px;height:860px;transform:scale(.7);transform-origin:top left;border-radius:14px;overflow:hidden;box-shadow:0 30px 60px rgba(60,40,20,.25);background:#fff}
.browser-bar{height:40px;background:#efe9e2;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid #e0d8cf}.browser-bar i{width:11px;height:11px;border-radius:50%;background:#d9c9bd}.browser-bar span{margin-left:12px;flex:1;background:#fff;border-radius:8px;height:26px;font-size:13px;color:#8a7a6f;display:flex;align-items:center;padding:0 12px}
.desktop .frame-inner{height:calc(860px - 40px)}
.frame-inner{container:app / inline-size;height:100%;overflow-y:auto;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
.app{min-height:100%;display:flex;flex-direction:column}
.content{padding:60px 18px 24px;flex:1}
.sidebar{display:none}
.bottom-nav{margin-top:auto;position:sticky;bottom:0;display:flex;justify-content:space-around;background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:10px 4px 22px}
.bottom-nav a{font-size:12px;font-weight:700;color:var(--muted);text-decoration:none;padding:4px 8px;border-radius:10px}.bottom-nav a.active{color:var(--primary);background:var(--soft)}
h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:18px 0 8px}h3{font-size:17px;margin:0 0 6px}
p{margin:0 0 6px}.lede{color:var(--muted);margin-bottom:14px}.hint{font-size:12px;color:var(--muted)}.muted{color:var(--muted);font-weight:400}.strong{font-weight:800;margin:0 0 4px}.eyebrow{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:800;margin:0 0 4px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:14px 16px;box-shadow:0 2px 0 rgba(60,40,20,.03)}
.stack{display:flex;flex-direction:column;gap:12px;list-style:none;margin:0;padding:0}
.two-col{display:flex;flex-direction:column;gap:12px}
.pill{display:inline-block;font-size:11.5px;font-weight:700;border-radius:999px;padding:3px 9px;margin:4px 6px 4px 0}
.pill.amber{background:var(--soft);color:var(--primary)}.pill.green{background:#dfeee0;color:#2d5a3a}.pill.grey{background:var(--line);color:var(--muted)}.pill.soft{background:var(--soft);color:var(--ink);font-weight:600}
.chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.chips.wrap{margin:8px 0}
.chip{border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700}.chip.on{border-color:var(--primary);background:var(--soft);color:var(--primary)}
.btn{font:inherit;font-weight:800;border-radius:14px;padding:11px 16px;border:1.5px solid transparent;cursor:pointer;font-size:14px}
.btn.primary{background:var(--primary);color:var(--onPrimary)}.btn.outline{background:transparent;border-color:var(--line);color:var(--ink)}.btn.ghost{background:transparent;border-color:var(--primary);color:var(--primary)}.btn.danger{border-color:var(--primary);color:var(--primary)}.btn.wide{width:100%;margin-top:12px}.btn.sm{padding:7px 12px;font-size:13px;border-radius:11px}.btn.light{background:var(--surface);color:var(--ink)}.btn.text{background:transparent;color:var(--surface)}
label{display:block;font-size:13px;font-weight:700;margin:10px 0 0}input,textarea{display:block;width:100%;margin-top:5px;font:inherit;font-size:14px;font-weight:500;padding:9px 11px;border:1.5px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink)}
.row{display:flex;gap:8px;align-items:flex-end}.row label{flex:1;margin:0}.row input{margin:0}.row .x{background:none;border:0;font-size:18px;color:var(--muted);cursor:pointer}
.row-links{display:flex;gap:14px;margin-top:10px;font-size:13px;font-weight:700}.row-links a,.link{color:var(--ink)}.row-links a.danger{color:var(--primary)}.link{display:inline-block;margin-top:6px;font-size:13px;font-weight:700}
.row-btns{display:flex;gap:8px;margin-top:10px}
.split{display:flex;justify-content:space-between;align-items:center;gap:10px}
.person.split{align-items:center}
.plan{display:block;text-decoration:none;color:inherit}
.banner{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--accent);color:var(--ink);border-radius:16px;padding:12px 14px;margin:0 0 14px;font-size:14px;font-weight:700}.banner a{color:inherit}.banner button{background:none;border:0;font-size:20px;line-height:1;cursor:pointer;color:inherit}
.banner.dark{background:var(--accent);color:var(--surface)}
.form .btn{margin-top:12px}.form p.strong{margin-bottom:2px}.form.editing{border-color:var(--primary)}
.sticky{position:sticky;top:16px}
.center{display:flex;justify-content:center}.graph{width:100%;max-width:340px}
.brand{display:flex;align-items:center;gap:10px;font-size:22px;padding:6px 8px 24px}.mark{width:26px;height:26px;border-radius:50%;background:var(--primary);position:relative;flex:none}.mark::after{content:'';position:absolute;inset:7px;border-radius:50%;border:3px solid var(--bg);border-right-color:transparent}.mark.big{width:44px;height:44px;margin-bottom:10px}.mark.big::after{inset:12px;border-width:5px}
.side-note{font-size:12px;color:var(--muted);margin-top:auto;padding:8px;line-height:1.5}
/* onboarding */
.onboarding .stepper{display:flex;gap:6px;list-style:none;margin:0;padding:56px 18px 0;justify-content:space-between}.stepper li{font-size:10px;font-weight:800;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:4px}.stepper li span{width:24px;height:24px;border-radius:50%;background:var(--line);display:grid;place-items:center;font-size:11px;color:var(--muted)}.stepper li.done span{background:var(--accent);color:var(--onPrimary)}.stepper li.now span{background:var(--primary);color:var(--onPrimary)}.stepper li.now{color:var(--ink)}
.onboarding .content{padding-top:18px}.side-card{display:none}
.mini-memory{background:var(--soft);border-radius:14px;padding:12px;margin-top:12px;display:flex;flex-direction:column;gap:2px;font-size:13px}.mini-memory em{color:var(--muted);font-style:normal;font-size:12px}
/* welcome */
.welcome{background:var(--bg)}.hero{position:relative;overflow:hidden;background:var(--soft);padding:70px 24px 40px;min-height:320px}.sun{position:absolute;width:150px;height:150px;border-radius:50%;background:var(--accent);top:30px;right:-30px;opacity:.9}.hill{position:absolute;border-radius:50%;background:var(--primary);opacity:.9}.hill-a{width:420px;height:260px;left:-120px;bottom:-190px;opacity:.75}.hill-b{width:380px;height:240px;right:-120px;bottom:-200px}.hero-text{position:relative}.hero-text h1{font-size:40px;margin:0}.hero-text p{font-size:17px;color:var(--ink);margin-top:6px}
.hero-form{padding:22px 24px 30px;max-width:480px}.hero-form h2{margin:0 0 4px}.personas{margin-top:22px}.personas .eyebrow{margin-bottom:2px}
/* push */
.os-toast{position:absolute;top:56px;left:14px;right:14px;z-index:9;display:flex;gap:10px;align-items:flex-start;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:blur(14px);border-radius:20px;padding:12px 14px;box-shadow:0 10px 30px rgba(60,40,20,.22);font-size:13px}.os-toast strong{font-size:13px}.os-toast p{margin:0;font-weight:700}.os-toast .hint{font-weight:500}
.desktop .os-toast{top:auto;bottom:24px;left:auto;right:24px;width:360px}
.os-toast + .app .content{padding-top:196px}
@container app (min-width: 700px){
  .app{display:grid;grid-template-columns:230px minmax(0,1fr)}
  .sidebar{display:flex;flex-direction:column;padding:26px 16px;border-right:1px solid var(--line);background:color-mix(in srgb,var(--surface) 60%,var(--bg));position:sticky;top:0;height:calc(860px - 40px)}
  .sidebar nav{display:flex;flex-direction:column;gap:4px}.sidebar nav a{text-decoration:none;color:var(--muted);font-weight:800;padding:10px 12px;border-radius:12px;font-size:14px}.sidebar nav a.active{background:var(--soft);color:var(--primary)}
  .bottom-nav{display:none}
  .content{padding:40px 48px;max-width:960px}
  .os-toast + .app .content{padding-top:40px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
  h1{font-size:34px}.lede{font-size:16px}
  .onboarding{grid-template-columns:1fr}.onboarding .stepper{padding:34px 48px 0;justify-content:flex-start;gap:28px}.stepper li{flex-direction:row;font-size:13px}
  .onboarding .content.narrow{max-width:640px;padding-top:24px}.onboarding{display:grid;grid-template-columns:minmax(0,1fr) 320px}.onboarding .stepper{grid-column:1 / -1}
  .side-card{display:block;margin:24px 40px 0 0;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px;align-self:start;position:sticky;top:24px}
  .welcome{display:grid;grid-template-columns:1.1fr 1fr;grid-template-rows:100%}.hero{min-height:100%;padding:80px 60px}.hero-text h1{font-size:56px}.sun{width:280px;height:280px;top:-40px;right:-60px}.hill-a{width:700px;height:420px;left:-200px;bottom:-320px}.hill-b{width:640px;height:400px;right:-200px;bottom:-330px}
  .hero-form{align-self:center;justify-self:center;width:100%;max-width:420px;padding:40px}
}
`

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Nunito:wght@500;700;800&display=swap" rel="stylesheet">`

function vars(p) {
  const page = `color-mix(in srgb, ${p.bg} 82%, #8a7a6a)`
  return `:root{--page:${page};--bg:${p.bg};--surface:${p.surface};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--primary:${p.primary};--onPrimary:${p.onPrimary};--accent:${p.accent};--soft:${p.soft}}`
}

function swatches(p) {
  return ['bg', 'surface', 'primary', 'accent', 'soft', 'ink', 'muted']
    .map(
      (key) => `<span class="swatch"><i style="background:${p[key]}"></i>${key} ${p[key]}</span>`,
    )
    .join('')
}

function page(index) {
  const m = mockups[index]
  const prev = mockups[index - 1],
    next = mockups[index + 1]
  const screen = m.screen()
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convene mockup ${String(index + 1).padStart(2, '0')}: ${m.title}</title>${fonts}<style>${vars(m.palette)}${css}</style></head>
<body><header class="page-head"><div class="crumbs"><a href="index.html">All mockups</a>${prev ? `<a href="${prev.slug}.html">← ${prev.title}</a>` : ''}${next ? `<a href="${next.slug}.html">${next.title} →</a>` : ''}</div>
<h1>${String(index + 1).padStart(2, '0')} · ${m.title}</h1><p><strong>${m.palette.name}.</strong> ${m.inspiration}</p><div class="swatches">${swatches(m.palette)}</div></header>
<div class="stage"><div><p class="label">Phone · 390 × 844</p><div class="phone"><div class="frame-inner">${screen}</div></div></div>
<div><p class="label">Computer · 1280 × 860 at 70%</p><div class="desktop-wrap"><div class="desktop"><div class="browser-bar"><i></i><i></i><i></i><span>convene.app/${m.slug.replace(/^\d+-/, '')}</span></div><div class="frame-inner">${screen}</div></div></div></div></div></body></html>`
}

function indexPage() {
  const cards = mockups
    .map(
      (m, i) =>
        `<a class="gallery-card" href="${m.slug}.html" style="--card-bg:${m.palette.bg};--card-primary:${m.palette.primary};--card-accent:${m.palette.accent};--card-ink:${m.palette.ink}"><span class="num">${String(i + 1).padStart(2, '0')}</span><strong>${m.title}</strong><span class="pal"><i style="background:${m.palette.bg}"></i><i style="background:${m.palette.soft}"></i><i style="background:${m.palette.accent}"></i><i style="background:${m.palette.primary}"></i><i style="background:${m.palette.ink}"></i></span><em>${m.palette.name}</em><p>${m.inspiration}</p></a>`,
    )
    .join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convene UI mockups</title>${fonts}<style>
:root{--page:#efe8df;--ink:#3d2b1f;--muted:#8c7b70;--line:#e3d8cc;--surface:#fffcf8}
body{margin:0;font-family:'Nunito',system-ui,sans-serif;background:var(--page);color:var(--ink);line-height:1.5}
main{max-width:1200px;margin:0 auto;padding:40px 24px 80px}h1,h2{font-family:'Fraunces',Georgia,serif;font-weight:600}h1{font-size:40px;margin:0 0 6px}.lede{font-size:17px;color:var(--muted);max-width:760px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin:28px 0}
.gallery-card{display:flex;flex-direction:column;gap:6px;text-decoration:none;color:var(--card-ink);background:var(--card-bg);border:1px solid rgba(0,0,0,.06);border-radius:22px;padding:20px;box-shadow:0 2px 0 rgba(60,40,20,.04);transition:transform .15s}.gallery-card:hover{transform:translateY(-3px)}
.gallery-card .num{font-family:'Fraunces',Georgia,serif;font-size:28px;color:var(--card-primary)}.gallery-card strong{font-size:18px}.gallery-card em{font-style:normal;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--card-primary);font-weight:800}.gallery-card p{margin:2px 0 0;font-size:13.5px}
.pal{display:flex;gap:6px}.pal i{width:20px;height:20px;border-radius:50%;border:1px solid rgba(0,0,0,.08)}
.sources{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:22px 26px}.sources ul{margin:8px 0 0;padding-left:20px}.sources li{margin:6px 0}.sources a{color:var(--ink)}
.principles{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin:18px 0 30px}.principles div{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px}.principles strong{display:block;margin-bottom:4px}
</style></head><body><main><h1>Convene UI mockups</h1><p class="lede">Ten screens, each shown on a phone and on a computer, each in its own warm palette drawn from 2026 colour-trend research. The layouts follow one system: cream bases, one anchor colour for actions, one accent for good news, rounded cards and rounded type.</p>
<div class="principles"><div><strong>60 / 25 / 15</strong>Warm neutral carries the layout, the anchor colour owns every primary action, the remaining 15% is a counterpoint or a grounding dark.</div><div><strong>Warm whites only</strong>Every background sits between cream and oat; no pure white, no cool grey, so the accents never look muddy.</div><div><strong>Rounded everything</strong>Fraunces for headings, Nunito for text, 18px card radii, pill chips, full-width buttons on phone.</div><div><strong>Same screen, two frames</strong>Each page renders the identical markup twice; container queries switch to a sidebar and two columns above 700px.</div></div>
<div class="grid">${cards}</div>
<section class="sources"><h2>Research sources</h2><ul>${sources.map(([label, url]) => `<li><a href="${url}" target="_blank" rel="noreferrer">${label}</a></li>`).join('')}</ul></section></main></body></html>`
}

mockups.forEach((m, i) => writeFileSync(path.join(outDir, `${m.slug}.html`), page(i)))
writeFileSync(path.join(outDir, 'index.html'), indexPage())
console.log(`Wrote ${mockups.length} mockups and index.html to ${outDir}`)
