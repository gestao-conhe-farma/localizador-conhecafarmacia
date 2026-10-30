-- Município de quem reserva.
--
-- Ao lado do nome e do telefone, é o dado que a farmácia usa para se orientar
-- quando liga de volta (e para perceber se a pessoa é da área). Opcional: há
-- reservas antigas e há quem reserve sem o indicar.
--
-- Sem lista fechada nem FK: o município é texto livre, como na conta
-- (`user_metadata.municipality`), e o formulário do Localizador pré-preenche-o
-- com o que estiver lá — continua editável em cada reserva.

alter table localizador.reservations
  add column if not exists requester_municipio text;

comment on column localizador.reservations.requester_municipio is
  'Município indicado por quem reservou (texto livre, opcional).';
