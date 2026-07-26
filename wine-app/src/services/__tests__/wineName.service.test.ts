/**
 * Region rules for splitting a label into producer, wine and
 * classification. Each case here is a real shape from the collection,
 * or a trap the previous positional parser fell into.
 */

import { describe, it, expect } from 'vitest'
import { parseWineName } from '../wineName.service'

describe('parseWineName — Tuscany', () => {
  it('keeps a denomination containing "di" intact', () => {
    // The old parser split at the second "di", producing
    // producer "Poggio di Sotto Brunello" / name "di Montalcino"
    const parsed = parseWineName('Poggio di Sotto Brunello di Montalcino', 'Tuscany')
    expect(parsed.producer).toBe('Poggio di Sotto')
    expect(parsed.name).toBe('Brunello di Montalcino')
    expect(parsed.confident).toBe(true)
  })

  it('distinguishes Rosso from Brunello at the same estate', () => {
    expect(parseWineName('Poggio di Sotto Rosso di Montalcino', 'Tuscany').name).toBe(
      'Rosso di Montalcino'
    )
  })

  it('keeps a parenthetical alias with the producer', () => {
    const parsed = parseWineName('Sesti (Castello di Argiano) Brunello di Montalcino', 'Tuscany')
    expect(parsed.producer).toBe('Sesti (Castello di Argiano)')
    expect(parsed.name).toBe('Brunello di Montalcino')
  })

  it('carries a quoted cru into the wine name', () => {
    const parsed = parseWineName("Siro Pacenti Brunello di Montalcino 'Vecchie Vigne'", 'Tuscany')
    expect(parsed.producer).toBe('Siro Pacenti')
    expect(parsed.name).toBe("Brunello di Montalcino 'Vecchie Vigne'")
  })

  it('gives a quoted proprietary name to the wine, not the producer', () => {
    // Super-Tuscan shape: the cuvée sits before the appellation
    const parsed = parseWineName("Fattoria Le Pupille 'Saffredi' Maremma Toscana", 'Tuscany')
    expect(parsed.producer).toBe('Fattoria Le Pupille')
    expect(parsed.name).toBe("'Saffredi' Maremma Toscana")
  })

  it('recognises the other Tuscan denominations', () => {
    expect(parseWineName('Fontodi Chianti Classico', 'Tuscany').name).toBe('Chianti Classico')
    expect(parseWineName('Avignonesi Vino Nobile di Montepulciano', 'Tuscany').name).toBe(
      'Vino Nobile di Montepulciano'
    )
  })
})

describe('parseWineName — Piedmont', () => {
  it('reads the structured "Denomination: Producer, Cru" form', () => {
    const parsed = parseWineName('Barolo: Massolino, Margheria', 'Piedmont')
    expect(parsed.producer).toBe('Massolino')
    expect(parsed.name).toBe('Barolo Margheria')
    expect(parsed.confident).toBe(true)
  })

  it('lifts Riserva out of the cru into classification', () => {
    const parsed = parseWineName('Barbaresco: Produttori del Barbaresco, Riserva Asili', 'Piedmont')
    expect(parsed.producer).toBe('Produttori del Barbaresco')
    expect(parsed.name).toBe('Barbaresco Asili')
    expect(parsed.classification).toMatch(/Riserva/i)
  })

  it('does not repeat a commune that shares the denomination name', () => {
    // "Barolo: Michele Chiarlo, Barolo" would otherwise read "Barolo Barolo"
    expect(parseWineName('Barolo: Michele Chiarlo, Barolo', 'Piedmont').name).toBe('Barolo')
  })

  it('keeps a parenthetical in the producer', () => {
    expect(parseWineName('Barolo: Chiara Boschis (E. Pira), Cannubi', 'Piedmont').producer).toBe(
      'Chiara Boschis (E. Pira)'
    )
  })
})

describe('parseWineName — Burgundy', () => {
  it('splits producer from village and lieu-dit', () => {
    // The old parser made the producer the entire string
    const parsed = parseWineName(
      "Domaine Latour-Giraud Meursault 1er Cru 'Boucheres'",
      'Burgundy'
    )
    expect(parsed.producer).toBe('Domaine Latour-Giraud')
    expect(parsed.name).toBe("Meursault 'Boucheres'")
    expect(parsed.classification).toBe('1er Cru')
  })

  it('handles a village wine with no cru', () => {
    const parsed = parseWineName('Domaine Bitouzet-Prieur Volnay', 'Burgundy')
    expect(parsed.producer).toBe('Domaine Bitouzet-Prieur')
    expect(parsed.name).toBe('Volnay')
  })

  it('handles négociant names without a Domaine prefix', () => {
    const parsed = parseWineName("Louis Jadot Beaune 1er Cru 'Clos des Ursules'", 'Burgundy')
    expect(parsed.producer).toBe('Louis Jadot')
    expect(parsed.name).toBe("Beaune 'Clos des Ursules'")
  })

  it('prefers the village over a grand cru name embedded in it', () => {
    // "Chambertin" must not match inside "Gevrey-Chambertin"
    const parsed = parseWineName('Domaine Taupenot-Merme Gevrey-Chambertin', 'Burgundy')
    expect(parsed.producer).toBe('Domaine Taupenot-Merme')
    expect(parsed.name).toBe('Gevrey-Chambertin')
  })

  it('keeps regional Bourgogne bottlings whole', () => {
    const parsed = parseWineName('Domaine Latour-Giraud Bourgogne Blanc', 'Burgundy')
    expect(parsed.producer).toBe('Domaine Latour-Giraud')
    expect(parsed.name).toBe('Bourgogne Blanc')
  })

  it('extracts a colour marker rather than leaving it in the name', () => {
    const parsed = parseWineName(
      "Domaine Marc Morey & Fils Chassagne 1er Cru 'Morgeot' (Rouge)",
      'Burgundy'
    )
    expect(parsed.name).toBe("Chassagne 'Morgeot'")
    expect(parsed.colour).toBe('Red')
  })
})

describe('parseWineName — Bordeaux', () => {
  it('treats the château as the producer with no separate wine name', () => {
    const parsed = parseWineName('Chateau Meyney', 'Bordeaux')
    expect(parsed.producer).toBe('Chateau Meyney')
    expect(parsed.name).toBe('')
    expect(parsed.confident).toBe(true)
  })

  it('keeps multi-word château names whole', () => {
    expect(parseWineName('Chateau Les Ormes de Pez', 'Bordeaux').producer).toBe(
      'Chateau Les Ormes de Pez'
    )
    expect(parseWineName('Chateau Clos du Marquis', 'Bordeaux').name).toBe('')
  })

  it('handles Graves estates named Domaine', () => {
    const parsed = parseWineName('Domaine de Chevalier (Rouge)', 'Bordeaux')
    expect(parsed.producer).toBe('Domaine de Chevalier')
    expect(parsed.colour).toBe('Red')
  })
})

describe('parseWineName — Germany', () => {
  it('splits a known producer from vineyard and grape', () => {
    // No appellation appears in a German name, and "Kupp" looks exactly
    // like a producer, so these rely on the known-producer list
    const parsed = parseWineName('Peter Lauer Kupp Riesling #18 GG', 'Saar')
    expect(parsed.producer).toBe('Peter Lauer')
    expect(parsed.name).toBe('Kupp Riesling #18')
    expect(parsed.classification).toBe('GG')
  })

  it('keeps Prädikat in the name, since it identifies the wine', () => {
    const parsed = parseWineName('Willi Schaefer Graacher Domprobst Spatlese #10', 'Mosel')
    expect(parsed.producer).toBe('Willi Schaefer')
    expect(parsed.name).toBe('Graacher Domprobst Spatlese #10')
  })

  it('distinguishes two wines from the same vineyard by cask number', () => {
    const a = parseWineName('Willi Schaefer Graacher Domprobst Kabinett #3', 'Mosel')
    const b = parseWineName('Willi Schaefer Graacher Himmelreich Kabinett #2', 'Mosel')
    expect(a.name).not.toBe(b.name)
  })
})

describe('parseWineName — Spain', () => {
  it('keeps a multi-word producer together', () => {
    // The old parser produced "R. Lopez" / "de Heredia Vina Tondonia Reserva"
    const parsed = parseWineName('R. Lopez de Heredia Vina Tondonia Reserva', 'Rioja')
    expect(parsed.producer).toBe('R. Lopez de Heredia')
    expect(parsed.name).toBe('Vina Tondonia')
    expect(parsed.classification).toBe('Reserva')
  })

  it('splits a numeric producer name correctly', () => {
    const parsed = parseWineName('4 Monos Aguja del Fraile', 'Sierra de Gredos')
    expect(parsed.producer).toBe('4 Monos')
    expect(parsed.name).toBe('Aguja del Fraile')
  })

  it('treats a Clos estate as the producer', () => {
    const parsed = parseWineName('Clos Mogador', 'Priorat')
    expect(parsed.producer).toBe('Clos Mogador')
    expect(parsed.name).toBe('')
  })
})

describe('parseWineName — overrides and fallback', () => {
  it('accepts a producer supplied by the caller', () => {
    const parsed = parseWineName('Weingut Nowhere Special Cuvee', 'Nowhere', ['Weingut Nowhere'])
    expect(parsed.producer).toBe('Weingut Nowhere')
    expect(parsed.name).toBe('Special Cuvee')
    expect(parsed.confident).toBe(true)
  })

  it('flags a name it could not recognise instead of failing silently', () => {
    const parsed = parseWineName('Some Unknown Estate Mystery Bottling', 'Atlantis')
    expect(parsed.confident).toBe(false)
    // It still produces something usable
    expect(parsed.producer).not.toBe('')
    expect(parsed.name).not.toBe('')
  })

  it('handles an empty or whitespace name', () => {
    expect(parseWineName('', 'Bordeaux')).toEqual({ producer: '', name: '', confident: false })
    expect(parseWineName('   ', 'Bordeaux').producer).toBe('')
  })

  it('collapses untidy whitespace', () => {
    expect(parseWineName('  Domaine   Bitouzet-Prieur   Volnay ', 'Burgundy').producer).toBe(
      'Domaine Bitouzet-Prieur'
    )
  })
})
