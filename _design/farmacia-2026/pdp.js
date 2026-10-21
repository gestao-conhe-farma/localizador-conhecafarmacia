/* ==========================================================================
   Ficha de produto (PDP) — camada partilhada pelos modelos D e E.
   Sem imagens de embalagem no projecto: o "pack" é tipográfico e assume-se
   como tal. Todos os dados são de demonstração, iguais aos das páginas.
   ========================================================================== */
(function () {
  'use strict';

  var PRODUCTS = {
    paracetamol: {
      ref: 'PAR500',
      brand: 'Generis',
      name: 'Paracetamol 500 mg',
      form: 'Comprimidos',
      pack: 'Caixa · 20 comprimidos',
      category: 'Comprimidos',
      price: 950,
      unit: '47,50 Kz por comprimido',
      stock: '18 caixas',
      fresh: '12 min',
      rx: false,
      summary:
        'Analgésico e antipirético para dor ligeira a moderada e febre. Não trata a causa da dor — alivia o sintoma enquanto o corpo recupera.',
      uses: [
        'Dor de cabeça, dores musculares e dor de dentes.',
        'Febre em adultos e crianças acima de 12 anos.',
        'Dor associada a constipações e estados gripais.'
      ],
      dose:
        '1 a 2 comprimidos por toma, de 6 em 6 horas. Não exceder 8 comprimidos (4 g) em 24 horas. Engolir com água, de preferência após a refeição.',
      care:
        'Guardar abaixo de 25 °C, ao abrigo da luz e da humidade. Manter fora do alcance das crianças. Validade confirmada na caixa: 09/2028.',
      warning:
        'Evitar em caso de doença hepática grave. Não combinar com outros produtos que contenham paracetamol — é a causa mais comum de sobredosagem acidental.',
      origin: 'Fabricado em Portugal · lote 24K18',
      alts: [
        { id: 'ibuprofeno', name: 'Ibuprofeno 400 mg', sub: 'cx 20 · outro princípio activo' },
        { id: 'amoxicilina', name: 'Amoxicilina 500 mg', sub: 'cx 21 cápsulas · receita' }
      ]
    },
    amoxicilina: {
      ref: 'AMO500',
      brand: 'Labesfal',
      name: 'Amoxicilina 500 mg',
      form: 'Cápsulas',
      pack: 'Caixa · 21 cápsulas',
      category: 'Comprimidos',
      price: 2400,
      unit: '114,29 Kz por cápsula',
      stock: '6 caixas',
      fresh: '41 min',
      rx: true,
      summary:
        'Antibiótico da família das penicilinas. Só deve ser usado com receita médica e até ao fim do tratamento prescrito, mesmo que os sintomas desapareçam.',
      uses: [
        'Infecções respiratórias, dentárias e urinárias bacterianas.',
        'Infecções de pele e tecidos moles, quando indicadas pelo médico.',
        'Erradicação de H. pylori, em esquema combinado.'
      ],
      dose:
        'A dose é definida pelo médico. O esquema habitual em adultos é 500 mg de 8 em 8 horas. Tomar a horas certas e completar o número de dias prescrito.',
      care:
        'Conservar abaixo de 25 °C e ao abrigo da humidade. Não guardar cápsulas fora do blister.',
      warning:
        'Não usar em caso de alergia a penicilinas. Pode reduzir a eficácia de contracéptivos orais — confirme com o médico. Não partilhar sobras.',
      origin: 'Fabricado em Portugal · lote A2409',
      alts: [
        { id: 'paracetamol', name: 'Paracetamol 500 mg', sub: 'cx 20 · para a febre' },
        { id: 'omeprazol', name: 'Omeprazol 20 mg', sub: 'cx 28 · protecção gástrica' }
      ]
    },
    metformina: {
      ref: 'MET850',
      brand: 'Generis',
      name: 'Metformina 850 mg',
      form: 'Comprimidos',
      pack: 'Caixa · 30 comprimidos',
      category: 'Comprimidos',
      price: 1850,
      unit: '61,67 Kz por comprimido',
      stock: '22 caixas',
      fresh: '41 min',
      rx: true,
      summary:
        'Antidiabético oral que ajuda a controlar a glicemia em diabetes tipo 2. Não substitui a alimentação nem a actividade física.',
      uses: [
        'Diabetes tipo 2, isoladamente ou com outros antidiabéticos.',
        'Síndrome dos ovários poliquísticos, quando prescrita.',
        'Prevenção de progressão em pré-diabetes seleccionados.'
      ],
      dose:
        'Início habitual: 1 comprimido ao pequeno-almoço. Ajuste gradual pelo médico, até 2 a 3 tomas por dia. Tomar com ou após a refeição.',
      care:
        'Conservar abaixo de 30 °C, ao abrigo da humidade. Verificar a validade na cartonagem antes de cada nova caixa.',
      warning:
        'Suspender antes de exames com contraste iodado e avisar o médico. Pode causar desconforto gástrico nas primeiras semanas.',
      origin: 'Fabricado em Portugal · lote M2211',
      alts: [
        { id: 'omeprazol', name: 'Omeprazol 20 mg', sub: 'cx 28 · uso frequente' },
        { id: 'paracetamol', name: 'Paracetamol 500 mg', sub: 'cx 20 · dor e febre' }
      ]
    },
    omeprazol: {
      ref: 'OME20',
      brand: 'Generis',
      name: 'Omeprazol 20 mg',
      form: 'Cápsulas gastrorresistentes',
      pack: 'Caixa · 28 cápsulas',
      category: 'Comprimidos',
      price: 1200,
      unit: '42,86 Kz por cápsula',
      stock: '14 caixas',
      fresh: '2 h',
      rx: false,
      summary:
        'Redutor da produção de ácido no estômago. Alivia azia, refluxo e protege a mucosa gástrica em tratamentos curtos.',
      uses: [
        'Azia e refluxo gastroesofágico ocasional.',
        'Protecção gástrica em doentes que tomam anti-inflamatórios.',
        'Úlcera gástrica, em esquema definido pelo médico.'
      ],
      dose:
        '1 cápsula por dia, 30 minutos antes do pequeno-almoço. Não abrir nem mastigar. Tratamentos curtos salvo indicação médica.',
      care:
        'Guardar abaixo de 25 °C, na cartonagem fechada. Humidade reduz a estabilidade das cápsulas.',
      warning:
        'Uso prolongado deve ser revisto pelo médico. Pode interferir com alguns anticoagulantes — informe a farmácia dos medicamentos que toma.',
      origin: 'Fabricado em Portugal · lote O1907',
      alts: [
        { id: 'metformina', name: 'Metformina 850 mg', sub: 'cx 30 · receita' },
        { id: 'paracetamol', name: 'Paracetamol 500 mg', sub: 'cx 20 · dor e febre' }
      ]
    },
    fraldas: {
      ref: 'FRAM',
      brand: 'Bem-Estar',
      name: 'Fraldas tamanho M',
      form: 'Fraldas descartáveis',
      pack: 'Pacote · 30 unidades',
      category: 'Parafarmácia',
      price: 6400,
      unit: '213,33 Kz por fralda',
      stock: '9 pacotes',
      fresh: '3 h',
      rx: false,
      counterOnly: true,
      summary:
        'Fralda descartável de uso diário, com banda elástica e indicador de humidade. Venda livre, apenas no balcão.',
      uses: [
        'Bebé entre 6 e 11 kg, conforme a tabela do fabricante.',
        'Uso diurno e nocturno.',
        'Pele sensível: confirme a composição no balcão.'
      ],
      dose:
        'Trocar a cada 2–3 horas ou sempre que estiver húmida. Limpar e secar bem a pele antes de colocar uma nova fralda.',
      care:
        'Conservar em local seco. Não guardar pacotes abertos junto de fontes de calor.',
      warning:
        'Interromper o uso se surgir irritação persistente. Não é um medicamento — não substitui cuidados médicos.',
      origin: 'Distribuído em Angola · lote F3340',
      alts: [
        { id: 'soro', name: 'Soro fisiológico 500 ml', sub: 'higiene diária' },
        { id: 'creme', name: 'Creme barreira bebé', sub: '100 ml · pele sensível' }
      ]
    },
    soro: {
      ref: 'SORO500',
      brand: 'B. Braun',
      name: 'Soro fisiológico 0,9%',
      form: 'Solução estéril',
      pack: 'Frasco · 500 ml',
      category: 'Parafarmácia',
      price: 900,
      unit: '1,80 Kz por ml',
      stock: '31 frascos',
      fresh: 'ontem',
      rx: false,
      summary:
        'Solução salina estéril para limpeza de feridas, lavagem nasal e higiene ocular. Uso externo.',
      uses: [
        'Limpeza de feridas superficiais e queimaduras ligeiras.',
        'Lavagem nasal em constipações e alergias.',
        'Higiene de olhos e de material de apoio.'
      ],
      dose:
        'Aplicar sobre a zona a limpar, com compressa estéril. Não reutilizar o frasco depois de aberto além de 24 horas.',
      care:
        'Conservar à temperatura ambiente, ao abrigo da luz. Não congelar.',
      warning:
        'Solução para uso externo. Não injectar. Depois de aberto, manter tapado e usar em 24 horas.',
      origin: 'Fabricado em Portugal · lote S0912',
      alts: [
        { id: 'creme', name: 'Creme barreira bebé', sub: '100 ml' },
        { id: 'fraldas', name: 'Fraldas tamanho M', sub: '30 unidades' }
      ]
    },
    creme: {
      ref: 'CREM100',
      brand: 'Mustela',
      name: 'Creme barreira bebé',
      form: 'Creme',
      pack: 'Bisnaga · 100 ml',
      category: 'Parafarmácia',
      price: 3100,
      unit: '31,00 Kz por ml',
      stock: '7 bisnagas',
      fresh: 'ontem',
      rx: false,
      summary:
        'Creme protector para a zona das fraldas, com óxido de zinco. Forma uma barreira contra a humidade e reduz o atrito.',
      uses: [
        'Prevenção e alívio de vermelhidão na zona das fraldas.',
        'Pele seca e sensível do bebé.',
        'Aplicação após cada muda, em camada fina.'
      ],
      dose:
        'Aplicar em camada fina sobre a pele limpa e seca, sempre que mudar a fralda. Não é necessário retirar completamente entre aplicações.',
      care:
        'Conservar abaixo de 25 °C. Fechar bem a bisnaga depois de usar.',
      warning:
        'Uso externo. Evitar contacto com os olhos. Suspender se houver irritação ou infecção fúngica — nesse caso, aconselhar na farmácia.',
      origin: 'Fabricado em França · lote C7781',
      alts: [
        { id: 'fraldas', name: 'Fraldas tamanho M', sub: '30 unidades' },
        { id: 'soro', name: 'Soro fisiológico 500 ml', sub: 'higiene diária' }
      ]
    },
    insulina: {
      ref: 'INS100',
      brand: 'Novo Nordisk',
      name: 'Insulina NPH 100 UI/ml',
      form: 'Suspensão injectável',
      pack: 'Frasco · 10 ml',
      category: 'Críticos',
      price: 8500,
      unit: '850,00 Kz por ml',
      stock: '4 frascos',
      fresh: '12 min',
      rx: true,
      summary:
        'Insulina de acção intermédia para controlo da glicemia em diabetes. Conservação refrigerada é parte do tratamento, não um detalhe.',
      uses: [
        'Diabetes tipo 1, em esquema basal.',
        'Diabetes tipo 2 quando os antidiabéticos orais não chegam.',
        'Controlo glicémico em contexto hospitalar, quando indicado.'
      ],
      dose:
        'Dose e horário definidos pelo médico. Injectar no tecido subcutâneo, alternando os locais. Não agitar com força — rolar o frasco entre as mãos.',
      care:
        'Guardar entre 2 e 8 °C, na parte de baixo do frigorífico. Não congelar. O frasco em uso pode ficar à temperatura ambiente até 28 dias.',
      warning:
        'Hipoglicemia é o risco principal. Ter açúcar de absorção rápida por perto. Não partilhar agulhas nem canetas.',
      origin: 'Fabricado na Dinamarca · lote N4410',
      alts: [
        { id: 'metformina', name: 'Metformina 850 mg', sub: 'cx 30 · receita' },
        { id: 'soro', name: 'Soro fisiológico 500 ml', sub: 'material de apoio' }
      ]
    },
    carbamazepina: {
      ref: 'CARB200',
      brand: 'Generis',
      name: 'Carbamazepina 200 mg',
      form: 'Comprimidos',
      pack: 'Caixa · 30 comprimidos',
      category: 'Críticos',
      price: 3200,
      unit: '106,67 Kz por comprimido',
      stock: '5 caixas',
      fresh: '12 min',
      rx: true,
      summary:
        'Anticonvulsivante usado em epilepsia e em algumas dores neuropáticas. A toma irregular é a causa mais comum de falha do tratamento.',
      uses: [
        'Epilepsia focal, em monoterapia ou combinada.',
        'Neuralgia do trigémeo.',
        'Estabilização do humor em situações seleccionadas.'
      ],
      dose:
        'Início e ajuste sempre pelo médico. Tomar com alimentos para reduzir desconforto gástrico. Não interromper abruptamente.',
      care:
        'Conservar abaixo de 25 °C, ao abrigo da humidade. Manter na cartonagem original.',
      warning:
        'Pode causar tonturas e sonolência nas primeiras semanas. Não conduzir até saber como reage. Interacções com muitos medicamentos — confirme sempre na farmácia.',
      origin: 'Fabricado em Portugal · lote CB118',
      alts: [
        { id: 'insulina', name: 'Insulina NPH 100 UI/ml', sub: '10 ml · receita' },
        { id: 'paracetamol', name: 'Paracetamol 500 mg', sub: 'cx 20' }
      ]
    },
    salbutamol: {
      ref: 'SAL100',
      brand: 'Ventilan',
      name: 'Salbutamol 100 µg',
      form: 'Inalador pressurizado',
      pack: 'Inalador · 200 doses',
      category: 'Críticos',
      price: 4750,
      unit: '23,75 Kz por dose',
      stock: '7 inaladores',
      fresh: '2 h',
      rx: false,
      summary:
        'Broncodilatador de alívio rápido para crises de asma e pieira. É o inalador «de resgate», não o de manutenção.',
      uses: [
        'Alívio de broncospasmo em asma e DPOC.',
        'Prevenção de crise induzida por exercício, quando indicada.',
        'Primeiros socorros em crise de pieira, conforme plano médico.'
      ],
      dose:
        '1 a 2 inalações em caso de crise. Se precisar de mais de 4 vezes por dia, procure o médico — a doença pode estar descontrolada.',
      care:
        'Guardar abaixo de 30 °C, longe do calor directo. Não perfurar nem queimar a lata, mesmo vazia.',
      warning:
        'Pode causar tremor e palpitações passageiras. Em crise que não cede, procure urgência em vez de repetir doses.',
      origin: 'Fabricado em Portugal · lote V2201',
      alts: [
        { id: 'paracetamol', name: 'Paracetamol 500 mg', sub: 'cx 20' },
        { id: 'amoxicilina', name: 'Amoxicilina 500 mg', sub: 'cx 21 · receita' }
      ]
    },
    acido: {
      ref: 'AF5',
      brand: 'Generis',
      name: 'Ácido fólico 5 mg',
      form: 'Comprimidos',
      pack: 'Caixa · 30 comprimidos',
      category: 'Comprimidos',
      price: 700,
      unit: '23,33 Kz por comprimido',
      stock: '26 caixas',
      fresh: '2 h',
      rx: false,
      summary:
        'Vitamina do grupo B usada na prevenção de defeitos do tubo neural na gravidez e em anemias por carência de folato.',
      uses: [
        'Suplementação antes e durante a gravidez, por indicação clínica.',
        'Anemia megaloblástica por carência de ácido fólico.',
        'Terapêutica adjuvante com alguns medicamentos.'
      ],
      dose:
        '1 comprimido por dia, salvo indicação diferente. Na gravidez, a dose e o momento são definidos pelo médico.',
      care:
        'Conservar ao abrigo da luz, abaixo de 25 °C. Manter na cartonagem.',
      warning:
        'Não substitui uma alimentação variada. Em caso de anemia, a causa tem de ser estudada antes de suplementar.',
      origin: 'Fabricado em Portugal · lote AF332',
      alts: [
        { id: 'metformina', name: 'Metformina 850 mg', sub: 'cx 30 · receita' },
        { id: 'omeprazol', name: 'Omeprazol 20 mg', sub: 'cx 28' }
      ]
    }
  };

  function money(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kz';
  }

  function esc(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var lastTrigger = null;
  var active = null;

  function htmlFor(p, context) {
    var alternatives = p.alts
      .map(function (a) {
        return (
          '<button class="alt-row" type="button" data-alt="' + a.id + '">' +
            '<span class="nm">' + esc(a.name) + '<span class="sub"> · ' + esc(a.sub) + '</span></span>' +
            '<span class="where">ver ficha</span>' +
          '</button>'
        );
      })
      .join('');

    var others =
      '<div class="pdp-alt">' +
        '<h3>Onde mais há</h3>' +
        '<div class="alt-row"><span class="nm">Farmácia Kianda <span class="sub">· Ingombota</span></span><span class="where"><b>' + esc(p.stock) + '</b> · há ' + esc(p.fresh) + '</span></div>' +
        '<div class="alt-row"><span class="nm">Farmácia Horizonte <span class="sub">· Cacuaco</span></span><span class="where"><b>4 caixas</b> · há 3 h</span></div>' +
      '</div>';

    var counterNote = p.counterOnly
      ? '<p class="pdp-terms">Este produto é de <b>venda apenas no balcão</b>. A reserva serve para o separarmos; o pagamento é feito na farmácia.</p>'
      : '';

    return (
      '<div class="pdp-media">' +
        '<div class="pack" aria-label="Embalagem representada por tipografia, sem fotografia">' +
          '<span class="pack-brand">' + esc(p.brand) + '</span>' +
          '<span class="pack-name">' + esc(p.name.replace(/ [0-9].*$/, '')) + '</span>' +
          '<span class="pack-dose">' + esc(p.name.match(/[0-9].*$/) ? p.name.match(/[0-9].*$/)[0] : '') + '</span>' +
          '<span class="pack-foot"><span>' + esc(p.pack.split(' · ')[1] || p.form) + '</span><span>' + esc(p.ref) + '</span></span>' +
        '</div>' +
        '<p class="pack-cap">Embalagem representada por tipografia — sem fotografia do produto.</p>' +
        '<div class="meta"><b>Origem</b>' + esc(p.origin) + '</div>' +
        '<div class="stamp"><span class="dot"></span><span><b>Confirmado pela farmácia</b><br>Stock escrito no portal há ' + esc(p.fresh) + '. A reserva baixa o saldo no mesmo instante.</span></div>' +
      '</div>' +

      '<div class="pdp-main">' +
        '<button class="pdp-x" type="button" data-close aria-label="Fechar ficha">✕</button>' +
        '<div class="pdp-crumb"><a href="#lista">Farmácias</a><span>/</span><b>' + esc(context.pharmacy) + '</b><span>/</span><span>' + esc(p.category) + '</span></div>' +
        '<div class="pdp-kicker"><span class="badge">' + esc(p.category) + '</span>' + (p.rx ? '<span class="rx solid">Receita</span>' : '<span class="badge muted">Venda livre</span>') + '</div>' +
        '<h2 class="pdp-title" id="pdp-title">' + esc(p.name) + '</h2>' +
        '<p class="pdp-form">' + esc(p.form) + '<span class="sep">·</span>' + esc(p.pack) + '<span class="sep">·</span><span class="num">' + esc(p.ref) + '</span></p>' +

        '<div class="pdp-buy">' +
          '<div class="pdp-priceblock">' +
            '<div class="row"><span class="price xl num">' + money(p.price) + '</span></div>' +
            '<span class="price-unit">' + esc(p.unit) + ' · IVA incluído</span>' +
          '</div>' +
          '<div class="pdp-avail"><b>' + esc(p.stock) + ' agora</b>Actualizado há ' + esc(p.fresh) + '<br>' + esc(context.hours) + '</div>' +
        '</div>' +

        '<div class="pdp-actions">' +
          '<button class="btn primary" type="button" data-reserve>' + (p.counterOnly ? 'Pedir para separar' : 'Reservar para levantar') + '</button>' +
          '<a class="btn ghost" href="tel:+244923114500">Ligar</a>' +
          '<button class="btn quiet" type="button" data-close>Continuar a ver</button>' +
        '</div>' +
        counterNote +
        '<p class="pdp-terms">Reserva guardada 2 horas. O pagamento é feito no balcão, com o código que receber. <a href="#">Como funciona a reserva</a></p>' +

        '<div class="pdp-sec"><h3>Para que serve</h3><p>' + esc(p.summary) + '</p></div>' +

        '<div class="pdp-sec">' +
          '<h3>Na ficha</h3>' +
          '<dl class="pdp-facts">' +
            '<div><dt>Forma</dt><dd>' + esc(p.form) + '</dd></div>' +
            '<div><dt>Embalagem</dt><dd>' + esc(p.pack) + '</dd></div>' +
            '<div><dt>Conservação</dt><dd>' + esc(p.care.split('.')[0]) + '</dd></div>' +
            '<div><dt>Dispensa</dt><dd>' + (p.rx ? 'Receita médica' : 'Sem receita') + '</dd></div>' +
          '</dl>' +
        '</div>' +

        '<div class="pdp-sec">' +
          '<div class="pdp-acc">' +
            '<details open><summary>Indicações</summary><div class="body"><ul>' + p.uses.map(function (u) { return '<li>' + esc(u) + '</li>'; }).join('') + '</ul></div></details>' +
            '<details><summary>Como tomar</summary><div class="body">' + esc(p.dose) + '</div></details>' +
            '<details><summary>Conservação</summary><div class="body">' + esc(p.care) + '</div></details>' +
            '<details><summary>Aviso</summary><div class="body">' + esc(p.warning) + '</div></details>' +
          '</div>' +
        '</div>' +

        '<div class="pdp-alt"><h3>Também nesta prateleira</h3>' + alternatives + '</div>' +
        others +
      '</div>'
    );
  }

  function dialog() {
    return document.getElementById('pdp');
  }

  function open(id, trigger, context) {
    var p = PRODUCTS[id];
    if (!p) return;
    var el = dialog();
    if (!el) return;

    lastTrigger = trigger || null;
    active = id;
    el.querySelector('.pdp-dialog').innerHTML = htmlFor(p, context);
    el.hidden = false;
    document.body.classList.add('no-scroll');
    el.querySelector('.pdp-dialog').setAttribute('aria-labelledby', 'pdp-title');
    var closeBtn = el.querySelector('.pdp-x');
    if (closeBtn) closeBtn.focus({ preventScroll: true });

    // reinicia o scroll da ficha a cada abertura
    var main = el.querySelector('.pdp-main');
    if (main) main.scrollTop = 0;

    bind(el, context);
  }

  function close() {
    var el = dialog();
    if (!el || el.hidden) return;
    el.hidden = true;
    document.body.classList.remove('no-scroll');
    active = null;
    if (lastTrigger) lastTrigger.focus({ preventScroll: true });
  }

  function toast(message) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.querySelector('span:last-child').textContent = message;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 4200);
  }

  function bind(root, context) {
    root.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', close);
    });
    var scrim = root.querySelector('.pdp-scrim');
    if (scrim) scrim.addEventListener('click', close);

    var reserve = root.querySelector('[data-reserve]');
    if (reserve) {
      reserve.addEventListener('click', function () {
        var code = 'SR-' + Math.floor(1000 + Math.random() * 9000);
        reserve.textContent = 'Reserva pedida · ' + code;
        reserve.disabled = true;
        toast('Reserva ' + code + ' guardada 2 h em ' + context.pharmacy + '.');
        var x = root.querySelector('.pdp-x');
        if (x) x.focus({ preventScroll: true });
      });
    }

    root.querySelectorAll('[data-alt]').forEach(function (b) {
      b.addEventListener('click', function () {
        open(b.getAttribute('data-alt'), lastTrigger, context);
      });
    });

    installTrap();
  }

  var trapInstalled = false;
  function installTrap() {
    if (trapInstalled) return;
    trapInstalled = true;
    document.addEventListener('keydown', function (e) {
      var el = dialog();
      if (!el || el.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var items = el.querySelectorAll('button, [href], input, select, textarea, summary');
      var list = Array.prototype.filter.call(items, function (n) {
        return !n.disabled && (n.offsetWidth || n.offsetHeight);
      });
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function contextOf(trigger) {
    return {
      pharmacy: (trigger && trigger.getAttribute('data-pharmacy')) || 'São Rafael',
      hours: (trigger && trigger.getAttribute('data-hours')) || 'Aberta até 20:00'
    };
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-open-pdp]');
    if (!trigger) return;
    e.preventDefault();
    open(trigger.getAttribute('data-open-pdp'), trigger, contextOf(trigger));
  });

  window.CFPDP = { open: open, close: close, products: PRODUCTS };
})();
