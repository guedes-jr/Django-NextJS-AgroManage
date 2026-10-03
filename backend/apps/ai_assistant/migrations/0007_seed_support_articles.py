from django.db import migrations

ARTICLES = [
    ("Por que a compra de uma matriz não aparece no mês atual?", "faq", "Dashboard", "O custo da compra aparece no período da data de compra/pagamento registrada. Uma matriz cadastrada hoje com compra em um ano anterior não entra no mês atual. Confira a data do cadastro e selecione o mês ou ano correspondente na dashboard."),
    ("Quem pode criar, editar e remover registros?", "faq", "Usuários", "Operadores podem criar categorias e adicionar registros. Gerentes, administradores e proprietários podem editar e remover. Administradores e proprietários gerenciam os membros da organização. Visualizadores têm acesso de leitura."),
    ("Registrar custos de mão de obra", "tutorial", "Suínos", "1. Entre na seção Mão de Obra dos Suínos.\n2. Informe a data, o setor, o funcionário ou equipe e a atividade.\n3. Escolha Diária, Mensal ou Por hora.\n4. Informe pessoas, quantidade trabalhada e valor unitário.\n5. Confira o custo total e registre o lançamento."),
    ("Por que o relatório mostra um traço no lugar de um valor?", "faq", "Relatórios", "O símbolo — indica informação ausente ou sem vínculo suficiente para calcular o indicador. Não equivale a zero. Confira os registros de custos, cobertura, parto, consumo e transferência associados ao animal ou lote."),
]


def seed(apps, schema_editor):
    Article = apps.get_model("ai_assistant", "SupportArticle")
    for position, (title, kind, category, content) in enumerate(ARTICLES):
        Article.objects.get_or_create(title=title, defaults={"kind": kind, "category": category, "content": content, "is_published": True, "position": position})


class Migration(migrations.Migration):
    dependencies = [("ai_assistant", "0006_supportarticle_supportconfiguration_and_more")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
