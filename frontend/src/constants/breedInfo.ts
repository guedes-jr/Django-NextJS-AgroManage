export interface BreedInfo {
  name: string;
  origin: string;
  environment: string;
  strengths: string[];
  weaknesses: string[];
  description: string;
  imageUrl?: string;
}

export const breedDictionary: Record<string, BreedInfo> = {
  "Large White": {
    name: "Large White",
    origin: "Condado de Yorkshire, Inglaterra.",
    environment: "Adapta-se a diversos sistemas, mas atinge pico de produção em confinamentos de alto padrão com clima controlado (temperado a subtropical).",
    strengths: [
      "Excelente habilidade materna e prolificidade (muitos leitões por leitegada).",
      "Ótima taxa de crescimento e conversão alimentar.",
      "Carcaça de excelente qualidade, magra e longa."
    ],
    weaknesses: [
      "Pele branca é sensível à radiação solar intensa (queimaduras).",
      "Alta exigência nutricional; requer dietas balanceadas para não perder desempenho."
    ],
    description: "Considerada a raça suína mais popular do mundo, a Large White é a base fundamental para a maioria dos cruzamentos de linhas maternas comerciais devido à sua excepcional capacidade reprodutiva.",
    imageUrl: "/images/breeds/large_white.png"
  },
  "Landrace": {
    name: "Landrace",
    origin: "Dinamarca (aprimorada a partir de suínos locais e do Large White).",
    environment: "Confinamento estruturado. Muito sensível a variações térmicas drásticas.",
    strengths: [
      "Comprimento de carcaça inigualável (mais costelas).",
      "Altíssima produção de leite e docilidade materna.",
      "Excelente desenvolvimento de pernil."
    ],
    weaknesses: [
      "Sensibilidade ao estresse (síndrome do estresse suíno em linhagens antigas).",
      "Pernas e aprumos exigem pisos de boa qualidade devido ao corpo longo."
    ],
    description: "O Landrace é essencial em matrizes F1 (Landrace x Large White). Destaca-se pelo corpo alongado e orelhas caídas (célticas), sendo crucial para aumentar o peso da leitegada ao desmame.",
    imageUrl: "/images/breeds/landrace.png"
  },
  "Duroc": {
    name: "Duroc",
    origin: "Estados Unidos (Nova Jersey e Nova York).",
    environment: "Extremamente rústico; adapta-se bem tanto ao confinamento quanto a sistemas semi-extensivos e climas mais quentes.",
    strengths: [
      "Excepcional taxa de crescimento e ganho de peso (GPD).",
      "Carne de altíssima qualidade (maior marmoreio e suculência).",
      "Alta rusticidade e resistência física."
    ],
    weaknesses: [
      "Habilidade materna e prolificidade inferiores às raças brancas.",
      "Pode apresentar agressividade se mal manejado."
    ],
    description: "Conhecido pela sua pelagem vermelha e orelhas ibéricas, o Duroc é amplamente utilizado como linha paterna (terminador) para transferir ganho de peso e qualidade de carne aos descendentes.",
    imageUrl: "/images/breeds/duroc.png"
  },
  "Pietrain": {
    name: "Pietrain",
    origin: "Bélgica (região de Brabante).",
    environment: "Confinamento de alta tecnologia. Muito sensível a temperaturas elevadas.",
    strengths: [
      "Maior rendimento de carcaça e carne magra entre todas as raças.",
      "Pernis hipertrofiados (dupla musculatura).",
      "Excelente conversão alimentar."
    ],
    weaknesses: [
      "Altamente susceptível ao estresse poroso (gene Halotano), podendo causar morte súbita ou carne PSE (pálida, mole e exsudativa).",
      "Baixa prolificidade e ganho de peso diário menor que o Duroc."
    ],
    description: "Famoso por sua pelagem malhada de preto e branco, o Pietrain é o 'fisiculturista' dos suínos. É a escolha primária para linhas paternas quando o mercado exige o máximo de carne magra.",
    imageUrl: "/images/breeds/pietrain.png"
  },
  "Moura": {
    name: "Moura",
    origin: "Brasil (Região Sul, desenvolvida a partir de cruzamentos de raças ibéricas e locais).",
    environment: "Sistemas extensivos ou semi-extensivos (caipira). Altamente adaptado ao clima brasileiro.",
    strengths: [
      "Extrema rusticidade e resistência a doenças e parasitas locais.",
      "Excelente capacidade de forrageamento.",
      "Carne com alto teor de gordura entremeada, muito saborosa (ideal para charcutaria)."
    ],
    weaknesses: [
      "Baixo desempenho comercial (crescimento lento e conversão alimentar ruim).",
      "Alta deposição de gordura subcutânea (banha)."
    ],
    description: "A raça Moura é um patrimônio genético nacional. Embora não compita na suinocultura industrial de larga escala, tem ganhado muito destaque na produção de carne premium artesanal.",
    imageUrl: "/images/breeds/moura.png"
  },
  "Wessex": {
    name: "Wessex Saddleback",
    origin: "Inglaterra (Dorset).",
    environment: "Excelente para sistemas ao ar livre (outdoor) e pastoreio.",
    strengths: [
      "Grande habilidade materna e produção de leite mesmo em pasto.",
      "Muito rústica e resistente a climas adversos.",
      "Boa capacidade de forragear."
    ],
    weaknesses: [
      "Crescimento mais lento comparado às raças brancas comerciais.",
      "Menor rendimento de carcaça."
    ],
    description: "O Wessex é inconfundível devido à sua pelagem preta com uma faixa branca sobre os ombros e patas dianteiras. É valorizado em produções orgânicas ou de nicho.",
    imageUrl: "/images/breeds/wessex.png"
  }
};
