import React from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import { useAppStore, Product } from '../../store';

interface Props {
  open: boolean;
  onClose: () => void;
  mode: 'team' | 'solo';
}

const teamTypeOptions = [
  { value: 'web', label: 'Web 应用' },
  { value: 'mobile', label: '移动端' },
  { value: 'enterprise', label: '企业软件' },
  { value: 'saas', label: 'SaaS 平台' },
  { value: 'other', label: '其他' },
];

const soloTypeOptions = [
  { value: 'saas', label: 'SaaS 产品' },
  { value: 'web', label: 'Web 应用' },
  { value: 'mobile', label: '移动端' },
  { value: 'tool', label: '开发者工具' },
  { value: 'other', label: '其他' },
];

const CreateProductModal: React.FC<Props> = ({ open, onClose, mode }) => {
  const [form] = Form.useForm();
  const addProduct = useAppStore((s) => s.addProduct);

  const isTeam = mode === 'team';
  const title = isTeam ? '新建团队产品' : '新建独立产品';

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const product: Product = {
        id: `prod-${Date.now()}`,
        name: values.name,
        description: values.description || '',
        type: values.type,
        mode,
        tagline: values.tagline,
        techStack: values.techStack,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      addProduct(product);
      message.success(`产品「${product.name}」已创建`);
      form.resetFields();
      onClose();
    } catch {
      // validation failed
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="创建"
      cancelText="取消"
      width={520}
      destroyOnClose
      okButtonProps={{
        style: {
          background: 'var(--purple-9)',
          borderColor: 'var(--purple-9)',
          borderRadius: 8,
        },
      }}
      cancelButtonProps={{
        style: {
          borderColor: 'var(--dls-border)',
          borderRadius: 8,
        },
      }}
      modalProps={{
        style: {
          borderRadius: 12,
        },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="name"
          label="产品名称"
          rules={[{ required: true, message: '请输入产品名称' }]}
        >
          <Input
            placeholder={isTeam ? '例如：苍穹供应链' : '例如：WriteFlow'}
            maxLength={50}
            showCount
            style={{
              borderRadius: 8,
              borderColor: 'var(--dls-border)',
            }}
          />
        </Form.Item>

        <Form.Item
          name="type"
          label="产品类型"
          rules={[{ required: true, message: '请选择产品类型' }]}
        >
          <Select
            options={isTeam ? teamTypeOptions : soloTypeOptions}
            placeholder="请选择产品类型"
            style={{
              borderRadius: 8,
            }}
          />
        </Form.Item>

        <Form.Item name="description" label="产品描述">
          <Input.TextArea
            rows={3}
            placeholder={isTeam ? '简要描述产品定位和目标用户…' : '一句话描述你的产品想法…'}
            maxLength={200}
            showCount
            style={{
              borderRadius: 8,
              borderColor: 'var(--dls-border)',
            }}
          />
        </Form.Item>

        {!isTeam && (
          <>
            <Form.Item name="tagline" label="产品 Slogan">
              <Input
                placeholder="例如：AI 写作助手 · 让思路流动起来"
                maxLength={60}
                showCount
                style={{
                  borderRadius: 8,
                  borderColor: 'var(--dls-border)',
                }}
              />
            </Form.Item>
            <Form.Item name="techStack" label="技术栈">
              <Input
                placeholder="例如：Next.js / Supabase / OpenAI"
                maxLength={100}
                style={{
                  borderRadius: 8,
                  borderColor: 'var(--dls-border)',
                }}
              />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
};

export default CreateProductModal;
