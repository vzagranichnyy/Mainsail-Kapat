// Small shared palette for KAPAT's uPlot charts, since Mainsail has no CSS
// custom properties for chart theming (unlike the standalone KAPAT app's
// cssVar() helper) -- static colors picked to read reasonably in both
// Vuetify dark/light themes, matching the standalone app's own fallback
// hexes for parity.

export function kapatChartColors(dark: boolean) {
    return {
        muted: dark ? '#8a8d91' : '#5f6368',
        grid: dark ? '#2c2f33' : '#dcdfe3',
        text: dark ? '#e8e8e8' : '#222',
        raw: 'rgba(201,138,82,0.2)',
        accent: '#c98a52',
        accentSoft: dark ? '#e0b98c' : '#b3701f',
        focus: '#3d8bfd',
        success: '#4caf50',
        bad: '#f04747',
    }
}
