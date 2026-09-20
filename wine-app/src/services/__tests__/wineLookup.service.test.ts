/**
 * The guard rails on an AI lookup.
 *
 * The prompt and the schema ask the model not to invent; these are the
 * checks that hold when it does anyway. A field that fails one is not
 * corrected — it is dropped and named, because a wrong number silently
 * rounded into range is worse than no number at all.
 */

import { describe, it, expect } from 'vitest'
import type { Wine } from '../../types/index'
import {
  plausible,
  fieldsToApply,
  usableSources,
  buildSystemPrompt,
  buildUserPrompt,
  LOOKUP_MODEL,
  type LookupPayload,
} from '../wineLookup.service'
import { describeFailure } from '../claudeClient.service'

/** A found wine with nothing filled in; each test adds what it needs. */
function payload(overrides: Partial<LookupPayload> = {}): LookupPayload {
  return {
    found: true,
    not_found_reason: null,
    country: null,
    region: null,
    classification: null,
    wine_type: null,
    varietal: null,
    alcohol_percent: null,
    drinking_window_start: null,
    drinking_window_end: null,
    serving_temp_min: null,
    serving_temp_max: null,
    critic_ratings: null,
    flavor_profile: null,
    notes: null,
    sources: [],
    ...overrides,
  }
}

describe('plausible — what a wine can actually be', () => {
  it('keeps a wholly ordinary answer', () => {
    const { fields, rejected } = plausible(
      payload({
        country: 'France',
        region: 'Bordeaux',
        wine_type: 'Red',
        varietal: 'Cabernet Sauvignon : Merlot',
        alcohol_percent: 13.5,
        drinking_window_start: 2026,
        drinking_window_end: 2040,
        serving_temp_min: 16,
        serving_temp_max: 18,
        critic_ratings: 'JS 97 : RP 96',
        flavor_profile: 'Blackberry : Cassis',
        notes: 'A classed growth from the left bank.',
      }),
      2019
    )

    expect(rejected).toEqual([])
    expect(fields).toMatchObject({
      country: 'France',
      wine_type: 'Red',
      alcohol_percent: '13.5',
      drinking_window_start: '2026',
      drinking_window_end: '2040',
      serving_temp_min: '16',
      serving_temp_max: '18',
      critic_ratings: 'JS 97 : RP 96',
    })
  })

  it('treats a blank string as no answer, not an answer of nothing', () => {
    const { fields } = plausible(payload({ country: '   ', notes: '' }), 2019)
    expect(fields.country).toBeUndefined()
    expect(fields.notes).toBeUndefined()
  })

  it.each([
    ['spirit-strength', 40],
    ['alcohol-free', 0],
    ['negative', -13],
  ])('drops %s alcohol rather than filing it', (_label, abv) => {
    const { fields, rejected } = plausible(payload({ alcohol_percent: abv }), 2019)
    expect(fields.alcohol_percent).toBeUndefined()
    expect(rejected).toContain('alcohol %')
  })

  it('keeps a fortified wine at 20%', () => {
    const { fields, rejected } = plausible(payload({ alcohol_percent: 20 }), 2019)
    expect(fields.alcohol_percent).toBe('20')
    expect(rejected).toEqual([])
  })

  it('refuses a window that closes before it opens', () => {
    const { fields, rejected } = plausible(
      payload({ drinking_window_start: 2040, drinking_window_end: 2030 }),
      2019
    )
    expect(fields.drinking_window_start).toBeUndefined()
    expect(fields.drinking_window_end).toBeUndefined()
    expect(rejected).toContain('drinking window')
  })

  it('refuses a window that opens before the grapes were picked', () => {
    const { rejected } = plausible(
      payload({ drinking_window_start: 2015, drinking_window_end: 2030 }),
      2019
    )
    expect(rejected).toContain('drinking window')
  })

  it('refuses half a window, rather than inventing the other half', () => {
    // One year alone would be stored as a real range by everything
    // downstream — the schedule cannot tell it apart from a researched one
    const { fields, rejected } = plausible(
      payload({ drinking_window_start: 2026, drinking_window_end: null }),
      2019
    )
    expect(fields.drinking_window_start).toBeUndefined()
    expect(rejected).toContain('drinking window')
  })

  it('refuses serving temperatures nothing is served at', () => {
    const { fields, rejected } = plausible(
      payload({ serving_temp_min: 45, serving_temp_max: 60 }),
      2019
    )
    expect(fields.serving_temp_min).toBeUndefined()
    expect(rejected).toContain('serving temperature')
  })

  it('accepts one serving temperature on its own', () => {
    // Unlike a window, a single temperature is still meaningful
    const { fields, rejected } = plausible(payload({ serving_temp_min: 8, serving_temp_max: null }), 2019)
    expect(fields.serving_temp_min).toBe('8')
    expect(rejected).toEqual([])
  })

  it('keeps only critic scores that name a critic and a real score', () => {
    // "probably about 95" is a hedge in a critic's clothes — the exact
    // shape an invented rating takes
    const { fields } = plausible(
      payload({ critic_ratings: 'JS 97 : probably about 95 : RP 96' }),
      2019
    )
    expect(fields.critic_ratings).toBe('JS 97 : RP 96')
  })

  it('keeps a critic who has a full name', () => {
    const { fields } = plausible(payload({ critic_ratings: 'Wine Spectator 94 : Vinous 93' }), 2019)
    expect(fields.critic_ratings).toBe('Wine Spectator 94 : Vinous 93')
  })

  it('drops a score outside any critic scale', () => {
    const { fields, rejected } = plausible(payload({ critic_ratings: 'RP 200' }), 2019)
    expect(fields.critic_ratings).toBeUndefined()
    expect(rejected).toContain('critic scores')
  })

  it('keeps a classification that reads like one', () => {
    const { fields, rejected } = plausible(payload({ classification: 'VDP Grosse Lage' }), 2019)
    expect(fields.classification).toBe('VDP Grosse Lage')
    expect(rejected).toEqual([])
  })

  it('drops a classification that is really a sentence about the wine', () => {
    // The box is for "1er Cru", not for a description of what that means
    const { fields, rejected } = plausible(
      payload({
        classification:
          'This wine is classified within the appellation system as one of the finest examples available',
      }),
      2019
    )
    expect(fields.classification).toBeUndefined()
    expect(rejected).toContain('classification')
  })

  it('never returns a field the cellar owns', () => {
    // Stock, price, merchant and tier are facts about the purchase; no
    // amount of research can know them, so the lookup must not carry them
    const { fields } = plausible(
      payload({ country: 'Italy', notes: 'Nebbiolo from Barolo.' }),
      2019
    )
    for (const forbidden of ['quantity', 'purchase_price', 'purchase_date', 'merchant', 'tier', 'format']) {
      expect(fields).not.toHaveProperty(forbidden)
    }
  })
})

/** A stored wine, sparse by default; each test fills what it needs. */
function stored(overrides: Partial<Wine> = {}): Wine {
  return {
    id: 'w1',
    name: 'Ahari',
    producer: 'Oxer Bastegieta',
    vintage: 2020,
    tier: 2,
    region: 'Basque Country',
    drinking_window_start: 2024,
    drinking_window_end: 2029,
    quantity_in_storage: 6,
    quantity_at_home: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

const FOUND = {
  country: 'Spain',
  region: 'Rioja',
  classification: 'DOCa',
  varietal: 'Tempranillo',
  alcohol_percent: '13.5',
  drinking_window_start: '2026',
  drinking_window_end: '2040',
  serving_temp_min: '16',
  serving_temp_max: '18',
  notes: 'Researched note.',
} as const

describe('fieldsToApply — adding writes over, editing fills gaps', () => {
  it('writes everything when adding, because the form holds placeholders', () => {
    const { apply, kept } = fieldsToApply({ ...FOUND })
    expect(apply).toEqual(FOUND)
    expect(kept).toEqual([])
  })

  it('leaves values the wine already has', () => {
    // The likely reason to look up a wine you own is a thin record, not
    // a wrong one — overwriting would undo an import or a correction
    const { apply, kept } = fieldsToApply(
      { ...FOUND },
      stored({ country: 'Spain', notes: 'My own tasting note.' })
    )
    expect(apply.country).toBeUndefined()
    expect(apply.notes).toBeUndefined()
    expect(kept).toContain('country')
    expect(kept).toContain('notes')
  })

  it('fills a gap the wine genuinely has', () => {
    const { apply } = fieldsToApply({ ...FOUND }, stored())
    expect(apply.country).toBe('Spain')
    expect(apply.classification).toBe('DOCa')
    expect(apply.varietal).toBe('Tempranillo')
    expect(apply.alcohol_percent).toBe('13.5')
  })

  it('never moves a stored drinking window', () => {
    // Every stored wine has one, and the schedules have been planning
    // around it — a researched window must not displace it silently
    const { apply, kept } = fieldsToApply({ ...FOUND }, stored())
    expect(apply.drinking_window_start).toBeUndefined()
    expect(apply.drinking_window_end).toBeUndefined()
    expect(kept).toContain('drinking_window_start')
  })

  it('judges emptiness by the stored wine, not the form', () => {
    // A wine with no serving temperature still shows 15-18 in the form,
    // because the form must put something in the box. Reading that as an
    // existing value would make the field most worth filling unfillable.
    const { apply } = fieldsToApply({ ...FOUND }, stored())
    expect(apply.serving_temp_min).toBe('16')
    expect(apply.serving_temp_max).toBe('18')

    const withTemps = fieldsToApply({ ...FOUND }, stored({ serving_temp_min: 14, serving_temp_max: 16 }))
    expect(withTemps.apply.serving_temp_min).toBeUndefined()
  })

  it('sees critic scores whether stored as text or as a parsed map', () => {
    expect(
      fieldsToApply({ critic_ratings: 'RP 95' }, stored({ critic_ratings: 'JS 97' })).apply
        .critic_ratings
    ).toBeUndefined()
    expect(
      fieldsToApply({ critic_ratings: 'RP 95' }, stored({ critic_ratings: { js: 97 } })).apply
        .critic_ratings
    ).toBeUndefined()
    expect(
      fieldsToApply({ critic_ratings: 'RP 95' }, stored({ critic_ratings: {} })).apply
        .critic_ratings
    ).toBe('RP 95')
  })

  it('fills a box the user has just cleared, so "clear it and look up again" is true', () => {
    // Without this the advice in the report only works after saving and
    // reopening — an empty box has nothing to protect
    const wine = stored({ country: 'Spain' })
    expect(fieldsToApply({ country: 'Chile' }, wine, { country: 'Spain' }).apply.country)
      .toBeUndefined()
    expect(fieldsToApply({ country: 'Chile' }, wine, { country: '' }).apply.country)
      .toBe('Chile')
  })

  it('still protects a stored value when the form is not passed', () => {
    expect(fieldsToApply({ country: 'Chile' }, stored({ country: 'Spain' })).apply.country)
      .toBeUndefined()
  })

  it('treats whitespace in a stored field as the gap it is', () => {
    const { apply } = fieldsToApply({ country: 'Spain' }, stored({ country: '   ' }))
    expect(apply.country).toBe('Spain')
  })
})

describe('usableSources', () => {
  it('keeps only links that can actually be opened', () => {
    expect(
      usableSources([
        'https://www.jancisrobinson.com/x',
        'not a url',
        'ftp://example.com/x',
        '',
      ])
    ).toEqual(['https://www.jancisrobinson.com/x'])
  })

  it('drops duplicates and caps the list', () => {
    const many = Array.from({ length: 9 }, (_, i) => `https://example.com/${i}`)
    expect(usableSources([...many, ...many])).toHaveLength(5)
  })
})

describe('describeFailure — each failure has a different fix', () => {
  it.each([
    [401, /API key was rejected/],
    [429, /Rate limited/],
    [404, new RegExp(LOOKUP_MODEL)],
    [529, /overloaded/],
    [503, /server error/],
  ])('explains HTTP %s in terms of what to do', (status, expected) => {
    expect(describeFailure(Object.assign(new Error('boom'), { status }))).toMatch(expected)
  })

  it('names an empty account rather than blaming the network', () => {
    expect(describeFailure(new Error('Your credit balance is too low'))).toMatch(/credit/i)
  })

  it('falls back to the message rather than swallowing it', () => {
    expect(describeFailure(new Error('something odd'))).toBe('something odd')
  })
})

describe('the instruction', () => {
  it('tells the model that a null is a correct answer', () => {
    // The load-bearing sentence: models invent because a blank feels
    // unhelpful, so the pressure to fill one has to be removed by name
    expect(buildSystemPrompt().replace(/\s+/g, ' ')).toMatch(/A null is a correct answer/)
  })

  it('forbids the three ways a wine lookup goes confidently wrong', () => {
    // Collapsed: the prompt is wrapped for reading, so a phrase can span
    // a line break. What matters is that the instruction is there.
    const prompt = buildSystemPrompt().replace(/\s+/g, ' ')
    expect(prompt).toMatch(/different vintage/i)
    expect(prompt).toMatch(/different cuvée/i)
    expect(prompt).toMatch(/Do not generalise from the region/i)
  })

  it('asks the question with all three identifying parts', () => {
    const asked = buildUserPrompt({ producer: 'Oxer Bastegieta', name: 'Ahari', vintage: 2020 })
    expect(asked).toContain('Oxer Bastegieta')
    expect(asked).toContain('Ahari')
    expect(asked).toContain('2020')
  })
})
