/**
 * Helpers explícitos para a fase pós-migração do seletivo.
 *
 * Objetivo:
 * - deixar claro no código novo que o fluxo preferencial é Registry-first
 * - evitar que arquivos principais continuem passando parâmetros legados
 * - manter retrocompatibilidade com fetchRGAByEmail_
 */

function fetchRGAByEmailUsingRegistry_(candidateEmail) {
  return fetchRGAByEmail_(null, null, SETTINGS.formsRgaHeader, candidateEmail);
}
