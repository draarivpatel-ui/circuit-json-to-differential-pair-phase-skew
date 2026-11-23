import { expect, test } from "bun:test"
import { DEFAULT_PHASE_SKEW_COLORS } from "lib/index"

test("default colours are KiCad's blue, red, white and grey", () => {
  expect(DEFAULT_PHASE_SKEW_COLORS).toEqual({
    positive: "rgb(0, 0, 255)",
    negative: "rgb(255, 0, 0)",
    zero: "rgb(255, 255, 255)",
    unknown: "rgb(128, 128, 128)",
  })
})
