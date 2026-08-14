import frappe
from frappe import _
from frappe.model.document import Document

DEFAULT_CHECKLIST = [
	("Documentos", "Carta de Condução"),
	("Documentos", "Ficha de Inspecção"),
	("Documentos", "Taxa de Rádio"),
	("Documentos", "Taxa Municipal"),
	("Documentos", "Manifesto"),
	("Documentos", "Livrete e Título de Propriedade"),
	("Documentos", "Seguro"),
	("Documentos", "Código de Estrada"),
	("Documentos", "Cadernetas dos Carros"),
	("Aparência Física do Equipamento", "Limpeza Geral (dentro, fora, atrelado)"),
	("Aparência Física do Equipamento", "Estado dos Pneus (danos e desgaste)"),
	("Aparência Física do Equipamento", "Poluição por Produtos Manuseados (contentor)"),
	("Aparência Física do Equipamento", "Fita Luminosa"),
	("Aparência Física do Equipamento", "Chapa Luminosa"),
	("Aparência Física do Equipamento", "Adesivo de Limite de Velocidade"),
	("Aparência Física do Equipamento", "Placa de Aluguer"),
	("Aparência Física do Equipamento", "Placa de Identificação da Empresa"),
	("Aparência Física do Equipamento", "Peso Bruto"),
	("Aparência Física do Equipamento", "Adesivo da Certificação ISO 9001:2015"),
	("Acessórios do Equipamento", "Macaco Hidráulico, Cabo do Macaco"),
	("Acessórios do Equipamento", "Pneu Sobressalente"),
	("Acessórios do Equipamento", "Chaves de Rodas"),
	("Acessórios do Equipamento", "Triângulo"),
	("Acessórios do Equipamento", "Correntes"),
	("Acessórios do Equipamento", "Alavanca para Remoção de Pneus"),
	("Acessórios do Equipamento", "Cintas"),
	("Acessórios do Equipamento", "Lonas"),
	("Acessórios do Equipamento", "Alicate"),
	("Acessórios do Equipamento", "Corner Plates"),
	("Bateria", "Conexão da Bateria"),
	("Bateria", "Travão de Mão Funcional"),
	("Bateria", "Painel e Mostrador em Boas Condições"),
	("Bateria", "Estado da Bateria"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Iluminação em Boas Condições"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Iluminação de Travão"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Buzina Funcional"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Limpa Brisa"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Kit de Primeiros Socorros"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Extintor"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Colete e Luvas"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Uniforme"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Óculos"),
	("Inspecção de Segurança de Equipamentos Eléctricos", "Capacete"),
	("Outras Verificações", "Nível de Combustível no Tanque (litros)"),
	("Outras Verificações", "Nível de Óleo Hidráulico"),
	("Outras Verificações", "Nível de Óleo de Motor"),
	("Outras Verificações", "Controlo Eléctrico"),
	("Outras Verificações", "Motorista Tem Equipamento de Segurança"),
	("Outras Verificações", "Cinto de Segurança em Boas Condições"),
	("Outras Verificações", "Rádio"),
	("Outras Verificações", "Colchão"),
	("Outras Verificações", "Piscas"),
	("Outras Verificações", "Tapetes do Veículo"),
	("Outras Verificações", "Ar-Condicionado"),
]


class FleetVehicleInspection(Document):
	def before_insert(self):
		if not self.items:
			for category, item in DEFAULT_CHECKLIST:
				self.append("items", {"category": category, "item": item, "status": "Conforme"})

	def validate(self):
		self.compute_summary()

	def compute_summary(self):
		non_conformities = [row for row in self.items if row.status == "Não Conforme"]
		self.non_conformities_count = len(non_conformities)
		self.overall_status = "Não Conforme" if non_conformities else "Conforme"

	def before_submit(self):
		if not self.items:
			frappe.throw(_("A lista de verificação não pode estar vazia."))
