// Scientific constants (CODATA 2018), numbered like the fx-991EX CONST list, plus extras.

export interface PhysConst {
  no: number
  symbol: string
  name: string
  value: number
  unit: string
  /** Identifier usable in expressions. */
  id: string
}

export const CONSTANTS: PhysConst[] = [
  { no: 1, symbol: 'mₚ', id: 'm_p', name: 'proton mass', value: 1.67262192369e-27, unit: 'kg' },
  { no: 2, symbol: 'mₙ', id: 'm_n', name: 'neutron mass', value: 1.67492749804e-27, unit: 'kg' },
  { no: 3, symbol: 'mₑ', id: 'm_e', name: 'electron mass', value: 9.1093837015e-31, unit: 'kg' },
  { no: 4, symbol: 'mμ', id: 'm_mu', name: 'muon mass', value: 1.883531627e-28, unit: 'kg' },
  { no: 5, symbol: 'a₀', id: 'a_0', name: 'Bohr radius', value: 5.29177210903e-11, unit: 'm' },
  { no: 6, symbol: 'h', id: 'h_P', name: 'Planck constant', value: 6.62607015e-34, unit: 'J s' },
  { no: 7, symbol: 'μN', id: 'mu_N', name: 'nuclear magneton', value: 5.0507837461e-27, unit: 'J/T' },
  { no: 8, symbol: 'μB', id: 'mu_B', name: 'Bohr magneton', value: 9.2740100783e-24, unit: 'J/T' },
  { no: 9, symbol: 'ħ', id: 'hbar', name: 'reduced Planck constant', value: 1.054571817e-34, unit: 'J s' },
  { no: 10, symbol: 'α', id: 'alpha_f', name: 'fine-structure constant', value: 7.2973525693e-3, unit: '' },
  { no: 11, symbol: 'rₑ', id: 'r_e', name: 'classical electron radius', value: 2.8179403262e-15, unit: 'm' },
  { no: 12, symbol: 'λc', id: 'lambda_c', name: 'Compton wavelength', value: 2.42631023867e-12, unit: 'm' },
  { no: 13, symbol: 'γₚ', id: 'gamma_p', name: 'proton gyromagnetic ratio', value: 2.6752218744e8, unit: '1/(s T)' },
  { no: 14, symbol: 'λcp', id: 'lambda_cp', name: 'proton Compton wavelength', value: 1.32140985539e-15, unit: 'm' },
  { no: 15, symbol: 'λcn', id: 'lambda_cn', name: 'neutron Compton wavelength', value: 1.31959090581e-15, unit: 'm' },
  { no: 16, symbol: 'R∞', id: 'R_inf', name: 'Rydberg constant', value: 10973731.56816, unit: '1/m' },
  { no: 17, symbol: 'u', id: 'u_amu', name: 'atomic mass unit', value: 1.6605390666e-27, unit: 'kg' },
  { no: 18, symbol: 'μₚ', id: 'mu_p', name: 'proton magnetic moment', value: 1.41060679736e-26, unit: 'J/T' },
  { no: 19, symbol: 'μₑ', id: 'mu_e', name: 'electron magnetic moment', value: -9.2847647043e-24, unit: 'J/T' },
  { no: 20, symbol: 'μₙ', id: 'mu_n', name: 'neutron magnetic moment', value: -9.6623651e-27, unit: 'J/T' },
  { no: 21, symbol: 'μμ', id: 'mu_mu', name: 'muon magnetic moment', value: -4.4904483e-26, unit: 'J/T' },
  { no: 22, symbol: 'F', id: 'F_far', name: 'Faraday constant', value: 96485.33212, unit: 'C/mol' },
  { no: 23, symbol: 'e', id: 'e_ch', name: 'elementary charge', value: 1.602176634e-19, unit: 'C' },
  { no: 24, symbol: 'Nₐ', id: 'N_A', name: 'Avogadro constant', value: 6.02214076e23, unit: '1/mol' },
  { no: 25, symbol: 'k', id: 'k_B', name: 'Boltzmann constant', value: 1.380649e-23, unit: 'J/K' },
  { no: 26, symbol: 'Vₘ', id: 'V_m', name: 'molar volume of ideal gas (273.15 K, 100 kPa)', value: 22.71095464e-3, unit: 'm³/mol' },
  { no: 27, symbol: 'R', id: 'R_gas', name: 'molar gas constant', value: 8.314462618, unit: 'J/(mol K)' },
  { no: 28, symbol: 'c₀', id: 'c_0', name: 'speed of light in vacuum', value: 299792458, unit: 'm/s' },
  { no: 29, symbol: 'c₁', id: 'c_1', name: 'first radiation constant', value: 3.741771852e-16, unit: 'W m²' },
  { no: 30, symbol: 'c₂', id: 'c_2', name: 'second radiation constant', value: 1.438776877e-2, unit: 'm K' },
  { no: 31, symbol: 'σ', id: 'sigma_SB', name: 'Stefan–Boltzmann constant', value: 5.670374419e-8, unit: 'W/(m² K⁴)' },
  { no: 32, symbol: 'ε₀', id: 'eps_0', name: 'electric constant (permittivity)', value: 8.8541878128e-12, unit: 'F/m' },
  { no: 33, symbol: 'μ₀', id: 'mu_0', name: 'magnetic constant (permeability)', value: 1.25663706212e-6, unit: 'N/A²' },
  { no: 34, symbol: 'Φ₀', id: 'phi_0', name: 'magnetic flux quantum', value: 2.067833848e-15, unit: 'Wb' },
  { no: 35, symbol: 'g', id: 'g_n', name: 'standard acceleration of gravity', value: 9.80665, unit: 'm/s²' },
  { no: 36, symbol: 'G₀', id: 'G_0', name: 'conductance quantum', value: 7.748091729e-5, unit: 'S' },
  { no: 37, symbol: 'Z₀', id: 'Z_0', name: 'characteristic impedance of vacuum', value: 376.730313668, unit: 'Ω' },
  { no: 38, symbol: 't', id: 't_C', name: 'Celsius temperature (0 °C in kelvin)', value: 273.15, unit: 'K' },
  { no: 39, symbol: 'G', id: 'G_grav', name: 'Newtonian constant of gravitation', value: 6.6743e-11, unit: 'N m²/kg²' },
  { no: 40, symbol: 'atm', id: 'atm_std', name: 'standard atmosphere', value: 101325, unit: 'Pa' },
  { no: 41, symbol: 'Rₖ', id: 'R_K', name: 'von Klitzing constant', value: 25812.80745, unit: 'Ω' },
  { no: 42, symbol: 'Kⱼ', id: 'K_J', name: 'Josephson constant', value: 483597.8484e9, unit: 'Hz/V' },
  { no: 43, symbol: 'mₚₗ', id: 'm_Pl', name: 'Planck mass', value: 2.176434e-8, unit: 'kg' },
  { no: 44, symbol: 'lₚ', id: 'l_Pl', name: 'Planck length', value: 1.616255e-35, unit: 'm' },
  { no: 45, symbol: 'tₚ', id: 't_Pl', name: 'Planck time', value: 5.391247e-44, unit: 's' },
  { no: 46, symbol: 'k₀', id: 'k_e', name: 'Coulomb constant 1/(4πε₀)', value: 8.9875517923e9, unit: 'N m²/C²' },
  { no: 47, symbol: 'M⊕', id: 'M_earth', name: 'mass of the Earth', value: 5.9722e24, unit: 'kg' },
  { no: 48, symbol: 'R⊕', id: 'R_earth', name: 'mean radius of the Earth', value: 6.371e6, unit: 'm' },
  { no: 49, symbol: 'M☉', id: 'M_sun', name: 'mass of the Sun', value: 1.98847e30, unit: 'kg' },
  { no: 50, symbol: 'AU', id: 'AU_len', name: 'astronomical unit', value: 1.495978707e11, unit: 'm' },
  { no: 51, symbol: 'eV', id: 'eV_J', name: 'electronvolt', value: 1.602176634e-19, unit: 'J' }
]

export const constantScope = (): Record<string, number> => Object.fromEntries(CONSTANTS.map((c) => [c.id, c.value]))
